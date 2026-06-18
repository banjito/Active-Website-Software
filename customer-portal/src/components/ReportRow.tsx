import { useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { getReportDownloadUrl, isOpenable, type ReportAsset } from '@/services/portalData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/utils';

type Action = 'view' | 'download';

export function ReportRow({ report, showJob = false }: { report: ReportAsset; showJob?: boolean }) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openable = isOpenable(report);

  async function resolveUrl(): Promise<string> {
    // Prefer the published PDF (private bucket, signed URL); fall back to a
    // directly-hosted file_url if that's all the report has.
    if (report.published_pdf_path) return getReportDownloadUrl(report.asset_id);
    if (report.file_url && /^https?:\/\//i.test(report.file_url)) return report.file_url;
    throw new Error('This report isn’t available for download yet.');
  }

  async function open(action: Action) {
    setBusy(action);
    setError(null);
    try {
      const url = await resolveUrl();
      const finalUrl =
        action === 'download'
          ? `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(
              `${report.asset_name ?? 'report'}.pdf`,
            )}`
          : url;
      window.open(finalUrl, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open report.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-medium">{report.asset_name ?? 'Report'}</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {report.substation && <span>{report.substation}</span>}
              {report.substation && <span>·</span>}
              <span>{formatDate(report.sent_at ?? report.approved_at ?? report.created_at)}</span>
              {showJob && (report.job_number || report.job_title) && (
                <>
                  <span>·</span>
                  <span className="truncate">
                    {report.job_number ? `${report.job_number} ` : ''}
                    {report.job_title}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {report.status && <Badge status={report.status}>{report.status}</Badge>}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => open('view')}
            disabled={!openable || busy !== null}
            title={openable ? 'View' : 'Not available for download yet'}
            aria-label="View report"
          >
            {busy === 'view' ? <Spinner /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => open('download')}
            disabled={!openable || busy !== null}
            title={openable ? 'Download' : 'Not available for download yet'}
            aria-label="Download report"
          >
            {busy === 'download' ? <Spinner /> : <Download className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
