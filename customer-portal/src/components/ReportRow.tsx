import { useCallback, useState } from "react";
import { Download, Eye, FileText, Flag, X } from "lucide-react";
import {
  fetchReportFlags,
  flagReport,
  getReportDownloadUrl,
  isOpenable,
  revokeReportFlag,
  type ReportAsset,
  type ReportFlag,
} from "@/services/portalData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";

type Action = "view" | "download";

export function ReportRow({
  report,
  showJob = false,
}: {
  report: ReportAsset;
  showJob?: boolean;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Flag modal state
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [existingFlags, setExistingFlags] = useState<ReportFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [localFlagCount, setLocalFlagCount] = useState(report.flag_count);

  const openable = isOpenable(report);

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      setExistingFlags(await fetchReportFlags(report.asset_id));
    } catch {
      // silently ignore — the flag form still works
    } finally {
      setFlagsLoading(false);
    }
  }, [report.asset_id]);

  async function openFlagModal() {
    setFlagError(null);
    setFlagReason("");
    if (localFlagCount > 0) await loadFlags();
    setFlagOpen(true);
  }

  async function submitFlag() {
    const reason = flagReason.trim();
    if (!reason) {
      setFlagError("Please describe what's wrong with this report.");
      return;
    }
    setFlagging(true);
    setFlagError(null);
    try {
      await flagReport(report.asset_id, reason);
      setLocalFlagCount((n) => n + 1);
      setFlagReason("");
      await loadFlags();
    } catch (e) {
      const msg =
        (e instanceof Error ? e.message : null) ??
        (typeof e === "object" && e && "message" in e
          ? String((e as { message: unknown }).message)
          : null) ??
        "Could not submit your flag.";
      setFlagError(msg);
    } finally {
      setFlagging(false);
    }
  }

  async function revokeFlag(flagId: string) {
    try {
      await revokeReportFlag(flagId);
      setLocalFlagCount((n) => Math.max(0, n - 1));
      await loadFlags();
    } catch {
      await loadFlags();
    }
  }

  async function resolveUrl(): Promise<string> {
    if (report.published_pdf_path) return getReportDownloadUrl(report.asset_id);
    if (report.file_url && /^https?:\/\//i.test(report.file_url))
      return report.file_url;
    throw new Error("This report isn’t available for download yet.");
  }

  async function open(action: Action) {
    setBusy(action);
    setError(null);
    try {
      const url = await resolveUrl();
      const finalUrl =
        action === "download"
          ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(
              `${report.asset_name ?? "report"}.pdf`,
            )}`
          : url;
      window.open(finalUrl, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open report.");
    } finally {
      setBusy(null);
    }
  }

  const badgeLabel =
    localFlagCount > 1 ? `Flagged (${localFlagCount})` : "Flagged";

  return (
    <div className="group border bg-card p-3 shadow-soft transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <FileText className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">
              {report.asset_name ?? "Report"}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {report.substation && <span>{report.substation}</span>}
              {report.substation && <span>·</span>}
              <span>
                {formatDate(
                  report.sent_at ?? report.approved_at ?? report.created_at,
                )}
              </span>
              {showJob && (report.job_number || report.job_title) && (
                <>
                  <span>·</span>
                  <span className="truncate">
                    {report.job_number ? `${report.job_number} ` : ""}
                    {report.job_title}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {localFlagCount > 0 && (
            <button
              type="button"
              onClick={openFlagModal}
              className="inline-flex cursor-pointer"
              title="View your flags for this report"
            >
              <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:hover:bg-yellow-900/60">
                {badgeLabel}
              </Badge>
            </button>
          )}
          {report.status && (
            <Badge status={report.status}>{report.status}</Badge>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => open("view")}
            disabled={!openable || busy !== null}
            title={openable ? "View" : "Not available for download yet"}
            aria-label="View report"
          >
            {busy === "view" ? <Spinner /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => open("download")}
            disabled={!openable || busy !== null}
            title={openable ? "Download" : "Not available for download yet"}
            aria-label="Download report"
          >
            {busy === "download" ? (
              <Spinner />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={openFlagModal}
            title="Flag a problem"
            aria-label="Flag report"
          >
            <Flag
              className={`h-4 w-4 ${localFlagCount > 0 ? "fill-yellow-500 text-yellow-500" : ""}`}
            />
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <Modal
        open={flagOpen}
        onClose={() => !flagging && setFlagOpen(false)}
        title="Flag this report"
        description={`Tell us what's wrong with "${report.asset_name ?? "this report"}". Our team will review it.`}
      >
        <div className="space-y-4">
          {/* Existing flags */}
          {flagsLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : (
            existingFlags.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Your flags
                </p>
                {existingFlags.map((f) => (
                  <div
                    key={f.id}
                    className="relative border bg-muted/40 px-3 py-2 pr-8 text-sm"
                  >
                    <p className="whitespace-pre-wrap">{f.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(f.created_at)}
                    </p>
                    <button
                      type="button"
                      onClick={() => revokeFlag(f.id)}
                      className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-lg leading-none text-destructive/60 hover:text-destructive"
                      title="Revoke this flag"
                      aria-label="Revoke flag"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {/* New flag form */}
          <div className="space-y-3">
            {existingFlags.length > 0 && (
              <p className="text-xs font-medium text-muted-foreground">
                Add another flag
              </p>
            )}
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Describe the issue (e.g. wrong data, missing pages, incorrect equipment)…"
              className="w-full resize-none border bg-background p-2.5 text-sm outline-none ring-inset focus:ring-2 focus:ring-primary"
            />
            {flagError && (
              <p className="text-xs text-destructive">{flagError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setFlagOpen(false)}
                disabled={flagging}
              >
                Close
              </Button>
              <Button onClick={submitFlag} disabled={flagging}>
                {flagging ? <Spinner /> : "Submit flag"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
