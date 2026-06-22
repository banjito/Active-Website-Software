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
      if (
        statusFilter !== "all" &&
        (r.status ?? "").toLowerCase() !== statusFilter
      )
        return false;
      if (!q) return true;
      return [r.asset_name, r.substation, r.job_number, r.job_title].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [reports, query, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex animate-fade-up flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every report we've published for you.
          </p>
        </div>
        <div className="group relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            className="pl-9"
            placeholder="Search reports…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-1.5 text-xs font-medium capitalize transition-all duration-300 ease-spring active:scale-95 ${
              statusFilter === s
                ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-soft"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
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
          {filtered.map((r, i) => (
            <div
              key={r.asset_id}
              className="enter"
              style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
            >
              <ReportRow report={r} showJob />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
