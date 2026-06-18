import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, MapPin, Search } from "lucide-react";
import {
  countAssetsByJob,
  getJobs,
  getReportAssets,
  type Job,
} from "@/services/portalData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";

export function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [jobsData, assets] = await Promise.all([
          getJobs(),
          getReportAssets(),
        ]);
        setJobs(jobsData);
        setCounts(countAssetsByJob(assets));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load jobs.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.job_number, j.title, j.site_address].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [jobs, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search job number or site…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {jobs.length === 0
              ? "No jobs are available yet."
              : "No jobs match your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((job) => {
            const count = counts[job.id] ?? 0;
            return (
              <Card
                key={job.id}
                className="cursor-pointer transition-colors hover:border-primary/50"
                onClick={() => navigate(`/jobs/${job.id}`)}
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {job.job_number ?? "—"}
                      </span>
                      {job.status && (
                        <Badge status={job.status}>
                          {job.status.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                    <div className="truncate font-medium">
                      {job.title ?? "Untitled job"}
                    </div>
                    {job.site_address && (
                      <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">{job.site_address}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-4 w-4" />
                      {count} {count === 1 ? "report" : "reports"}
                    </span>
                    <span className="hidden sm:inline">
                      {formatDate(job.created_at)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
