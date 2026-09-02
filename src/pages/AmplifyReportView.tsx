import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RefreshCw, Trash2 } from "lucide-react";
import { companyConfig } from "@/lib/companyConfig";
import {
  resultSeverity,
  severityDot,
  type AmplifyReport,
} from "@/lib/amplifyReport";
import { buildAmplifyReportPdf } from "@/lib/amplifyReportPdf";
import { reviseAmplifyReport } from "@/lib/amplifyReportParse";
import {
  deleteAmplifyConversion,
  getAmplifyBatch,
  getAmplifyConversion,
  updateAmplifyConversionReport,
  type SavedAmplifyReport,
} from "@/lib/amplifyReportStore";
import AmplifyReportView from "@/components/amplify/ReportView";
import RegenerateDialog from "@/components/amplify/RegenerateDialog";
import SendToJobDialog from "@/components/reports/common/SendToJobDialog";

/**
 * A saved AMP-lify report.
 *
 * Reports converted from the same workbook share a batch, so this also offers
 * the siblings without sending the user back to the index.
 *
 * The conversion is a single model pass over a hand-maintained workbook, so it
 * can land a value on the wrong row. "Regenerate" revises the saved report from
 * a one-line instruction rather than making the engineer re-upload the file.
 */

/**
 * Icon-only header control with a tooltip, since the icon alone does not say
 * what it does. `title` is deliberately not used: the native tooltip takes a
 * second to appear and cannot be styled to match.
 */
const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, danger, children }) => (
  <div className="group relative">
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-none border border-neutral-200 bg-white px-2.5 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 ${
        danger
          ? "hover:border-red-300 hover:text-red-600 dark:hover:border-red-500/40 dark:hover:text-red-400"
          : "hover:border-brand hover:text-brand"
      }`}
    >
      {children}
    </button>
    <span
      role="tooltip"
      // Shown on hover and on keyboard focus. pointer-events-none keeps it from
      // swallowing the click it is sitting under.
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 whitespace-nowrap bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-neutral-700"
    >
      {label}
    </span>
  </div>
);

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
  const [regenOpen, setRegenOpen] = useState(false);
  // Set when the model declined the instruction; cleared on the next run.
  const [regenNote, setRegenNote] = useState<string | null>(null);

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

  /**
   * Build a PDF from the given reports and hand it to the browser.
   *
   * The renderer already lays several reports out as one document, so the
   * combined download is the same call with the whole batch rather than a
   * separate merge step.
   */
  const download = useCallback(
    async (reports: AmplifyReport[], fileName: string) => {
      setBuilding(true);
      setError(null);
      try {
        const blob = await buildAmplifyReportPdf(reports, pdfCompany);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
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
    },
    // pdfCompany is derived from module-level config, so it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onDownload = useCallback(() => {
    if (!saved) return;
    // The deliverable is a test report, not an AMP-lify artifact: nothing
    // about the tool belongs in the file name a customer receives.
    return download(
      [saved.report],
      `${saved.label.replace(/\s+/g, "-")}-Test-Report.pdf`,
    );
  }, [saved, download]);

  /** Every report from this upload, in source order, as one document. */
  const onDownloadBatch = useCallback(() => {
    if (siblings.length === 0) return;
    const site = siblings.find((s) => s.report.siteName)?.report.siteName;
    const base = (site || saved?.report.jobNumber || "Test").replace(
      /\s+/g,
      "-",
    );
    return download(
      siblings.map((s) => s.report),
      `${base}-Test-Reports.pdf`,
    );
  }, [siblings, saved, download]);

  const onRegenerate = useCallback(
    async (instruction: string) => {
      if (!saved) throw new Error("Report is still loading");

      const { report, note } = await reviseAmplifyReport(
        saved.report,
        instruction,
      );
      const updated = await updateAmplifyConversionReport(saved.id, report);

      setSaved(updated);
      // The switcher chips carry the label and status, so a revision that moved
      // either has to reach them too.
      setSiblings((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      setRegenNote(note || null);
      setError(null);
    },
    [saved],
  );

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
          <IconButton
            label="Regenerate"
            onClick={() => setRegenOpen(true)}
            disabled={!saved || deleting}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Delete"
            onClick={onDelete}
            disabled={deleting || !saved}
            danger
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
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
          {siblings.length > 1 && (
            <button
              type="button"
              onClick={onDownloadBatch}
              disabled={building || !saved}
              className="rounded-none border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-300 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            >
              {`Download all ${siblings.length} as one PDF`}
            </button>
          )}
          <button
            type="button"
            onClick={onDownload}
            disabled={building || !saved}
            className="rounded-none bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {building ? "Building…" : "Download this report"}
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

        {regenNote && (
          <div className="mb-4 flex items-start justify-between gap-4 rounded-none border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <span>{regenNote}</span>
            <button
              type="button"
              onClick={() => setRegenNote(null)}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Dismiss
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
        <RegenerateDialog
          open={regenOpen}
          onClose={() => setRegenOpen(false)}
          label={saved.label}
          onSubmit={onRegenerate}
        />
      )}

      {saved && (
        <SendToJobDialog
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          defaultName={`${saved.label} - Test Report`}
          defaultSubstation={saved.report.siteName || saved.siteName || ""}
          buildFile={buildFile}
          onUploaded={(jobId) => setSentTo(jobId)}
        />
      )}
    </div>
  );
};

export default AmplifyReportPage;
