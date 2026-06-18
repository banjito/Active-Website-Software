import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getReportAssets, type ReportAsset } from "@/services/portalData";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ReportRow } from "@/components/ReportRow";

const STATUS_FILTERS = ["all", "sent", "approved"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export function Reports() {
  const [reports, setReports] = useState<ReportAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    (async () => {
      try {
        setReports(await getReportAssets());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load reports.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== "all" && (r.status ?? "").toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return [r.asset_name, r.substation, r.job_number, r.job_title].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [reports, query, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search reports…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center border-none text-sm text-muted-foreground">
            {reports.length === 0
              ? "No reports are available yet."
              : "No reports match your filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <ReportRow key={r.asset_id} report={r} showJob />
          ))}
        </div>
      )}
    </div>
  );
}
