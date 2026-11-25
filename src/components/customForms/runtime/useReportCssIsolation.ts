/**
 * Keep the hard-coded reports' stylesheets off custom-form pages.
 *
 * The report sheets (tagged `data-report-print`) are already off on every page
 * except while a report is open: see src/lib/reportStyles.ts. A custom form can
 * run inside a report's frame, so this keeps them off even then. Their unscoped
 * rules centre table cells, pin column widths and hide anything whose class
 * mentions "header", which misaligns a custom form on screen and in print.
 */
import { useNoReportStyles } from "@/lib/reportStyles";

export { REPORT_STYLE_ATTRIBUTE } from "@/lib/reportStyles";

export function useReportCssIsolation(): void {
  useNoReportStyles();
}
