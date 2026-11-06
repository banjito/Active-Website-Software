import React, { useEffect, useMemo, useState } from "react";
import { FilePlus2, LineChart, Pencil, Replace, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { assetDetailRows, REPORT_STATUS_LABELS, type DetailRow } from "@/lib/diagrams/assetDetails";
import type { MissingReason } from "@/lib/diagrams/flowElements";
import { getSymbolGeometry } from "@/lib/diagrams/symbols";
import type { EquipmentAsset } from "@/lib/types/assetTracking";
import type { DiagramReport, DiagramSymbolRow } from "@/lib/types/siteDiagrams";

/** What the panel can do. Differs by screen and by who's looking. */
export interface DiagramDetailsActions {
  /** Set when the diagram was opened from a job, which limits the reports to that job's. */
  jobId: string | null;
  canEdit: boolean;
  /** Assets on the job it was opened from. Null from the site view. */
  jobAssetIds: Set<string> | null;
  loadReports: (assetId: string) => Promise<DiagramReport[]>;
  loadStatuses: (assetIds: string[]) => Promise<Map<string, string>>;
  onOpenReport: (report: DiagramReport) => void;
  onEditAsset: (asset: EquipmentAsset) => void;
  onAddReport: (asset: EquipmentAsset) => void;
  onShowTrends: (asset: EquipmentAsset) => void;
  onReplaceAsset: (asset: EquipmentAsset) => void;
}

interface DiagramDetailsPanelProps {
  symbol: DiagramSymbolRow;
  /** The full record. Missing when the asset isn't at this site, or the item has none. */
  asset: EquipmentAsset | null;
  symbolName: string;
  missing: MissingReason | null;
  /** The asset that replaced this one, and the one it replaced, by name. */
  replacedBy: string | null;
  replaces: string | null;
  actions: DiagramDetailsActions;
  onClose: () => void;
}

function Rows({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map((row) => (
        <React.Fragment key={row.label}>
          <dt className="text-neutral-500 dark:text-neutral-400">{row.label}</dt>
          <dd className="min-w-0 break-words">{row.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
      {children}
    </h3>
  );
}

function Reports({ assetId, actions }: { assetId: string; actions: DiagramDetailsActions }) {
  const { loadReports, onOpenReport, jobId } = actions;
  /** undefined while loading. null if the lookup failed. */
  const [reports, setReports] = useState<DiagramReport[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setReports(undefined);
    loadReports(assetId)
      .then((rows) => {
        if (!cancelled) setReports(rows);
      })
      .catch((error) => {
        console.error("Failed to load reports:", error);
        if (!cancelled) setReports(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, loadReports]);

  if (reports === undefined) return <LoadingSpinner size="sm" />;
  if (reports === null) {
    return <p className="text-sm text-red-600 dark:text-red-400">Reports couldn't be loaded.</p>;
  }
  if (reports.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {jobId ? "No reports on this job." : "No reports yet."}
      </p>
    );
  }

  return (
    <ul className="-mx-1">
      {reports.map((report) => (
        <li key={report.id}>
          <button
            type="button"
            className="block w-full px-1 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700"
            onClick={() => onOpenReport(report)}
          >
            <span className="block break-words text-sm font-medium text-brand">{report.name}</span>
            <span className="block text-xs text-neutral-500 dark:text-neutral-400">
              {[
                report.jobLabel,
                report.status ? (REPORT_STATUS_LABELS[report.status] ?? report.status) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const MISSING_MESSAGES: Record<MissingReason, string> = {
  deleted: "This asset was deleted.",
  moved: "This asset was moved to another site.",
  retired: "This asset is retired.",
};

/** Floats over the diagram and closes, so nothing stays fixed beside the one-line. */
export default function DiagramDetailsPanel({
  symbol,
  asset,
  symbolName,
  missing,
  replacedBy,
  replaces,
  actions,
  onClose,
}: DiagramDetailsPanelProps) {
  const { jobId, canEdit, jobAssetIds, onEditAsset, onAddReport, onShowTrends, onReplaceAsset } =
    actions;
  const rows = useMemo(() => (asset ? assetDetailRows(asset) : null), [asset]);

  const title = asset?.identifier ?? symbol.asset?.identifier ?? symbolName;
  const subtitle = asset?.equipment_type ?? symbol.asset?.equipment_type;
  const assetId = symbol.asset_id;
  const onThisJob = !jobAssetIds || (!!assetId && jobAssetIds.has(assetId));

  return (
    <aside
      aria-label="Details"
      className="absolute right-3 top-44 z-10 flex max-h-[calc(100vh-12rem)] print:hidden w-80 max-w-[calc(100vw-1.5rem)] flex-col border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-800"
    >
      <div className="flex items-start gap-2 border-b border-neutral-200 p-3 dark:border-neutral-700">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-base font-semibold">{title}</h2>
          {subtitle && (
            <p className="break-words text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" title="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {missing && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {MISSING_MESSAGES[missing]} Replace it, or remove it from the diagram.
          </p>
        )}

        {!assetId && !missing && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {symbol.symbol_key === "link"
              ? "Connects to the link with the same name on another diagram."
              : "Not linked to an asset."}
          </p>
        )}

        {asset && (
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<Pencil className="h-4 w-4" />}
                onClick={() => onEditAsset(asset)}
              >
                Edit Asset
              </Button>
            )}
            {canEdit && !replacedBy && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<Replace className="h-4 w-4" />}
                onClick={() => onReplaceAsset(asset)}
              >
                Replace Asset
              </Button>
            )}
            {canEdit && jobId && onThisJob && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<FilePlus2 className="h-4 w-4" />}
                onClick={() => onAddReport(asset)}
              >
                Add Report
              </Button>
            )}
            {!jobId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<LineChart className="h-4 w-4" />}
                onClick={() => onShowTrends(asset)}
              >
                Trends
              </Button>
            )}
          </div>
        )}

        {jobId && assetId && !onThisJob && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            This asset isn't on this job.
          </p>
        )}

        {rows && rows.details.length > 0 && (
          <section>
            <SectionTitle>Details</SectionTitle>
            <Rows
              rows={[
                ...rows.details,
                ...(replacedBy ? [{ label: "Replaced by", value: replacedBy }] : []),
                ...(replaces ? [{ label: "Replaces", value: replaces }] : []),
              ]}
            />
          </section>
        )}

        {rows && rows.nameplate.length > 0 && (
          <section>
            <SectionTitle>Nameplate</SectionTitle>
            <Rows rows={rows.nameplate} />
          </section>
        )}

        {assetId && (
          <section>
            <SectionTitle>Reports</SectionTitle>
            <Reports assetId={assetId} actions={actions} />
          </section>
        )}
      </div>
    </aside>
  );
}

/** The panel's fallback title for an item with no asset and no label. */
export const symbolTypeName = (symbolKey: string) => getSymbolGeometry(symbolKey).label;
