import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { companyConfig } from "@/lib/companyConfig";
import { resultSeverity, severityDot } from "@/lib/amplifyReport";
import { buildAmplifyReportPdf } from "@/lib/amplifyReportPdf";
import {
  deleteAmplifyConversion,
  getAmplifyBatch,
  getAmplifyConversion,
  type SavedAmplifyReport,
} from "@/lib/amplifyReportStore";
import AmplifyReportView from "@/components/amplify/ReportView";
import SendToJobDialog from "@/components/reports/common/SendToJobDialog";

/**
 * A saved AMP-lify report.
 *
 * Reports converted from the same workbook share a batch, so this also offers
 * the siblings without sending the user back to the index.
 */

const AmplifyReportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [saved, setSaved] = useState<SavedAmplifyReport | null>(null);
  const [siblings, setSiblings] = useState<SavedAmplifyReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  /** Company block shared by the download and send-to-job paths. */
  const pdfCompany = {
    fullName: companyConfig.fullName,
    addressLine: companyConfig.addressLine,
    phone: companyConfig.phone,
    websiteDomain: companyConfig.websiteDomain,
    // Deliverables carry the company mark, not the ampOS product mark.
    logoPath: companyConfig.reportLogoPath,
  };

  const buildFile = useCallback(
    async (fileName: string): Promise<File> => {
      if (!saved) throw new Error("Report is still loading");
      const blob = await buildAmplifyReportPdf([saved.report], pdfCompany);
      return new File([blob], fileName, { type: "application/pdf" });
    },
    // pdfCompany is derived from module-level config, so it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const row = await getAmplifyConversion(id);
        if (cancelled) return;
        setSaved(row);
        // Siblings are a nicety; a failure here should not blank the report.
        try {
          const batch = await getAmplifyBatch(row.batchId);
          if (!cancelled) setSiblings(batch);
        } catch {
          if (!cancelled) setSiblings([row]);
        }
      } catch (err) {
        if (!cancelled) setError(String((err as Error)?.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const onDownload = useCallback(async () => {
    if (!saved) return;
    setBuilding(true);
    setError(null);
    try {
      const blob = await buildAmplifyReportPdf([saved.report], pdfCompany);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AMP-lify-${saved.label.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(
        `Could not build the PDF: ${String((err as Error)?.message || err)}`,
      );
    } finally {
      setBuilding(false);
    }
  }, [saved]);

  const onDelete = useCallback(async () => {
    if (!saved) return;
    // Re-converting costs an API call, so confirm first.
    if (
      !window.confirm(
        `Delete the converted report for "${saved.label}"? Converting it again means re-running the workbook.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await deleteAmplifyConversion(saved.id);
      // Stay in the batch if other reports from this upload are still around.
      const next = siblings.find((s) => s.id !== saved.id);
      navigate(next ? `/amplify-reports/${next.id}` : "/amplify-reports", {
        replace: true,
      });
    } catch (err) {
      setError(String((err as Error)?.message || err));
      setDeleting(false);
    }
  }, [saved, siblings, navigate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
            AMP-lify Report
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {saved ? saved.label : companyConfig.fullName}
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting || !saved}
            title={saved ? `Delete ${saved.label}` : "Delete"}
            className="inline-flex items-center gap-2 rounded-none border border-neutral-200 bg-white px-2.5 py-2.5 text-sm font-medium text-neutral-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-red-500/40 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/amplify-reports")}
            className="rounded-none border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            Convert another
          </button>
          <button
            type="button"
            onClick={() => setSendOpen(true)}
            disabled={!saved}
            className="rounded-none border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-300 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            Send to job
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={building || !saved}
            className="rounded-none bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {building ? "Building…" : "Download branded PDF"}
          </button>
        </div>
      </div>

      <div>
        {sentTo && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-none border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span>Sent to the job. It is in the Reports tab for review.</span>
            <button
              type="button"
              onClick={() => navigate(`/jobs/${sentTo}`)}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Open job
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-600">
            Loading report…
          </p>
        ) : saved ? (
          <>
            {/* Sibling reports from the same upload */}
            {siblings.length > 1 && (
              <div className="mb-6 print:hidden">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Reports in this workbook
                </p>
                <div className="flex flex-wrap gap-2">
                  {siblings.map((s) => {
                    const sev = resultSeverity(s.status ?? undefined);
                    const isActive = s.id === saved.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate(`/amplify-reports/${s.id}`)}
                        className={`inline-flex items-center gap-2 rounded-none border px-3.5 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? "border-brand bg-brand text-white"
                            : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-none ${severityDot[sev]}`}
                          aria-hidden="true"
                        />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <AmplifyReportView report={saved.report} />

            <div className="mt-8 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
              <p>
                {companyConfig.fullName} · {companyConfig.addressLine} ·{" "}
                {companyConfig.phone} · {companyConfig.websiteDomain}
              </p>
              {saved.sourceFile && (
                <p className="mt-1">Converted from {saved.sourceFile}.</p>
              )}
            </div>
          </>
        ) : (
          !error && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              That report could not be found.
            </p>
          )
        )}
      </div>

      {saved && (
        <SendToJobDialog
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          defaultName={`AMP-lify Report - ${saved.label}`}
          defaultSubstation={saved.report.siteName || saved.siteName || ""}
          buildFile={buildFile}
          onUploaded={(jobId) => setSentTo(jobId)}
        />
      )}
    </div>
  );
};

export default AmplifyReportPage;
