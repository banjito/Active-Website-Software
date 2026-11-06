// "Return to where I left off" for the job Reports list (Settings menu).
//
// When a tech opens a report from the list we drop a marker in sessionStorage. When the
// job page mounts again it takes the marker, switches to the Reports tab, and scrolls to
// that row. The open substations are remembered separately, per job, by JobDetail.

export const REPORT_RETURN_POSITION_PREF = "ui.reportReturnPosition";
/** On unless the user turns it off: it's what techs expect. */
export const REPORT_RETURN_POSITION_DEFAULT = true;

export interface ReportReturnMarker {
  assetId: string;
  /** The list page the report was on, so a long job reopens on the right page. */
  page: number;
}

const markerKey = (jobId: string) => `amp:job-report-return:${jobId}`;

export function rememberOpenedReport(
  jobId: string | undefined,
  assetId: string,
  page: number,
) {
  if (!jobId) return;
  try {
    window.sessionStorage.setItem(
      markerKey(jobId),
      JSON.stringify({ assetId, page } satisfies ReportReturnMarker),
    );
  } catch {
    // Storage blocked. The list just opens the old way.
  }
}

/** Read and clear the marker, so it only fires once per trip into a report. */
export function takeOpenedReport(
  jobId: string | undefined,
): ReportReturnMarker | null {
  if (!jobId) return null;
  try {
    const raw = window.sessionStorage.getItem(markerKey(jobId));
    window.sessionStorage.removeItem(markerKey(jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.assetId !== "string") return null;
    return { assetId: parsed.assetId, page: Number(parsed.page) || 1 };
  } catch {
    return null;
  }
}
