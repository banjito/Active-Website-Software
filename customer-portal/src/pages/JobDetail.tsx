import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import {
  getJob,
  getReportAssetsForJob,
  getDeliverablesForJob,
  type Job,
  type ReportAsset,
  type Deliverable,
} from '@/services/portalData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ReportRow } from '@/components/ReportRow';
import { formatDate } from '@/lib/utils';

export function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [reports, setReports] = useState<ReportAsset[]>([]);
  const [packets, setPackets] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      try {
        const [jobData, reportsData, packetsData] = await Promise.all([
          getJob(jobId),
          getReportAssetsForJob(jobId),
          getDeliverablesForJob(jobId),
        ]);
        setJob(jobData);
        setReports(reportsData);
        setPackets(packetsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load job.');
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  // Group reports by substation, mirroring the staff app's grouping.
  const groups = useMemo(() => {
    const map = new Map<string, ReportAsset[]>();
    for (const r of reports) {
      const key = r.substation || 'Other';
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [reports]);

  // Resolve each packet's bundled asset ids to the customer's accessible reports,
  // preserving the order the staff app chose. Ids the customer can't open are
  // silently dropped — the packet never widens access.
  const reportsById = useMemo(() => {
    const map = new Map<string, ReportAsset>();
    for (const r of reports) map.set(r.asset_id, r);
    return map;
  }, [reports]);

  const packetReports = (packet: Deliverable): ReportAsset[] =>
    (packet.report_asset_ids ?? [])
      .map((id) => reportsById.get(id))
      .filter((r): r is ReportAsset => r != null);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!job) return <p className="text-sm text-muted-foreground">This job isn't available.</p>;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/jobs')}
        className="group -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-300 ease-spring group-hover:-translate-x-0.5" />{' '}
        All jobs
      </Button>

      <div className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{job.job_number ?? '—'}</span>
          {job.status && <Badge status={job.status}>{job.status.replace(/_/g, ' ')}</Badge>}
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{job.title ?? 'Untitled job'}</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {job.site_address && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" /> {job.site_address}
            </span>
          )}
          <span>Created {formatDate(job.created_at)}</span>
        </div>
      </div>

      {packets.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Report Packets
          </h2>
          {packets.map((packet, i) => {
            const items = packetReports(packet);
            return (
              <Card
                key={packet.id}
                className="enter"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {packet.name ?? 'Report Packet'}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({items.length})
                    </span>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Delivered {formatDate(packet.delivered_at ?? packet.created_at)}</span>
                    {packet.description && (
                      <>
                        <span>·</span>
                        <span>{packet.description}</span>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      The reports in this packet aren’t available yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((r) => (
                        <ReportRow key={r.asset_id} report={r} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No published reports for this job yet.
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          {packets.length > 0 && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              All reports
            </h2>
          )}
          {groups.map(([substation, items], i) => (
            <Card key={substation} className="enter" style={{ animationDelay: `${i * 70}ms` }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {substation}
                  <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map((r) => (
                    <ReportRow key={r.asset_id} report={r} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
