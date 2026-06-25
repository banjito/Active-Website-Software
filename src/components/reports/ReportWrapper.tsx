import React, { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface ReportWrapperProps {
  children: React.ReactNode;
  isPrintMode?: boolean;
  /**
   * @deprecated The side-by-side print preview was removed. This prop is now a
   * no-op and is kept only so existing call sites continue to type-check.
   */
  disablePreview?: boolean;
  /**
   * When provided, communicates edit state to parent window via postMessage
   * so review approval modals can show "Save & Approve" vs "Approve".
   */
  isEditing?: boolean;
}

export const ReportWrapper: React.FC<ReportWrapperProps> = ({
  children,
  isPrintMode = false,
  disablePreview = false,
  isEditing,
}) => {
  const saveResolverRef = useRef<(() => void) | null>(null);

  const postEditState = (nextIsEditing: boolean) => {
    if (typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage(
      { type: "reportEditState", isEditing: nextIsEditing },
      "*",
    );
  };

  const isVisible = (element: HTMLElement) => {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.offsetParent !== null
    );
  };

  const findSaveButton = () => {
    const container = document.getElementById("report-container");
    if (!container) return null;

    const buttons = Array.from(
      container.querySelectorAll("button"),
    ) as HTMLButtonElement[];
    return (
      buttons.find((button) => {
        if (button.disabled || !isVisible(button)) return false;
        const text = (button.textContent || "").trim().toLowerCase();
        if (!text) return false;
        if (
          text.includes("ready") ||
          text.includes("review") ||
          text.includes("print") ||
          text.includes("preview") ||
          text.includes("approve") ||
          text.includes("reject")
        ) {
          return false;
        }
        return (
          text === "save" ||
          text.includes("save report") ||
          text.includes("save new report") ||
          text.includes("save & close") ||
          text.includes("update report")
        );
      }) || null
    );
  };

  const hasEditableFields = () => {
    const container = document.getElementById("report-container");
    if (!container) return false;

    const fields = Array.from(
      container.querySelectorAll("input, textarea, select"),
    ) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

    return fields.some((field) => {
      if (!isVisible(field)) return false;
      if (field.disabled) return false;
      if (field.tagName === "SELECT") return true;
      const input = field as HTMLInputElement | HTMLTextAreaElement;
      return !input.readOnly;
    });
  };

  const deriveIsEditingFromDom = () =>
    Boolean(findSaveButton()) || hasEditableFields();

  // Communicate edit state to parent window (for approval modal "Save & Approve" button)
  useEffect(() => {
    if (isEditing === undefined) return;
    postEditState(isEditing);
  }, [isEditing]);

  // Fallback for report types that do not pass isEditing into ReportWrapper yet.
  useEffect(() => {
    if (isEditing !== undefined || typeof window === "undefined") return;

    let lastState: boolean | null = null;
    let observer: MutationObserver | null = null;

    const notifyIfChanged = () => {
      const nextState = deriveIsEditingFromDom();
      if (nextState === lastState) return;
      lastState = nextState;
      postEditState(nextState);
    };

    const attachObserver = () => {
      observer?.disconnect();
      const container = document.getElementById("report-container");
      if (!container) return;
      observer = new MutationObserver(notifyIfChanged);
      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "disabled"],
      });
      notifyIfChanged();
    };

    const timer = window.setTimeout(attachObserver, 0);
    window.addEventListener("load", attachObserver);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", attachObserver);
      observer?.disconnect();
    };
  }, [isEditing]);

  // Listen for save-then-approve requests from parent approval modal
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "requestSave") {
        let settled = false;
        const complete = (success: boolean, reason?: string) => {
          if (settled) return;
          settled = true;
          saveResolverRef.current = null;
          window.parent.postMessage(
            { type: "saveComplete", success, reason },
            "*",
          );
        };

        const event = new CustomEvent("approvalSaveRequest", {
          detail: {
            resolve: () => complete(true),
            reject: (reason?: string) => complete(false, reason),
          },
        });

        saveResolverRef.current = () => complete(true);
        document.dispatchEvent(event);

        window.setTimeout(() => {
          if (settled) return;
          const saveButton = findSaveButton();
          if (!saveButton) {
            complete(false, "No save button was found.");
            return;
          }

          saveButton.click();

          const startedAt = Date.now();
          const waitForSave = window.setInterval(() => {
            if (settled) {
              window.clearInterval(waitForSave);
              return;
            }
            if (!deriveIsEditingFromDom()) {
              window.clearInterval(waitForSave);
              complete(true);
              return;
            }
            if (Date.now() - startedAt > 8000) {
              window.clearInterval(waitForSave);
              complete(false, "The report did not finish saving.");
            }
          }, 250);
        }, 0);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
  useEffect(() => {
    // Inject print CSS (remove old + re-inject so latest rules always apply)
    if (typeof document !== "undefined") {
      const existing = document.getElementById("vm-standard-print-css");
      if (existing) existing.remove();

      const style = document.createElement("style");
      style.id = "vm-standard-print-css";

      // Detect Windows platform and add class to html element
      const isWindows =
        navigator.platform.includes("Win") ||
        navigator.userAgent.includes("Windows");
      if (isWindows && typeof document !== "undefined") {
        document.documentElement.classList.add("is-windows");
      }

      style.textContent = `
        /* Screen-only min-height - does NOT apply to print or embedded mode */
        @media screen {
          .screen-min-height {
            min-height: calc(100vh + 100px);
          }
        }

        @media print {
          html, body, #root, #report-container {
            background: #ffffff !important;
            color: #000000 !important;
            color-scheme: light !important;
          }

          #report-container,
          #report-container * {
            color-scheme: light !important;
          }
        }

        /* ============================================ */
        /* COMMENT TEXT WRAPPING - all reports         */
        /* ============================================ */
        #report-container .comments-section textarea,
        #report-container .section-comments textarea,
        #report-container .comments-print-section textarea,
        #report-container .comments-section-print textarea,
        #report-container .comments-onscreen textarea,
        #report-container .visual-mechanical-comments textarea,
        #report-container .electrical-comments-section textarea,
        #report-container .comments-cell,
        #report-container .comments-text,
        #report-container .comments-print-wrapper,
        #report-container .comments-section td,
        #report-container .section-comments td,
        #report-container .comments-section table td,
        #report-container .section-comments table td,
        #report-container .comments-section table td div,
        #report-container .section-comments table td div,
        #report-container .comments-print-section td,
        #report-container .comments-section-print table td,
        #report-container .comments-section-print table td div,
        #report-container table.hidden.print\\:table td,
        #report-container table.comments-print-table td,
        #report-container h2.section-comments ~ table td,
        #report-container h2.section-comments ~ div table td,
        #report-container div.hidden.print\\:block:not(.job-info-print) > table td,
        #report-container div.hidden.print\\:block:not(.job-info-print) > table td div,
        #report-container div.hidden.print\\:block:not(.job-info-print) h2 + table td {
          white-space: pre-wrap !important;
          overflow-wrap: break-word !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
        }
        #report-container .comments-section table,
        #report-container .section-comments table,
        #report-container table.hidden.print\\:table,
        #report-container table.comments-print-table,
        #report-container div.hidden.print\\:block:not(.job-info-print) > table.table-fixed,
        #report-container h2.section-comments ~ table,
        #report-container h2.section-comments ~ div table {
          table-layout: fixed !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        /* Remove min-height for embedded/print preview mode */
        .force-print .screen-min-height,
        .force-print #report-container {
          min-height: 0 !important;
          height: auto !important;
        }

        @media print {
          html, body {
            min-height: 0 !important;
            height: auto !important;
            padding-bottom: 0 !important;
          }

          .min-h-screen, .screen-min-height {
            min-height: 0 !important;
            height: auto !important;
          }

          #report-container {
            padding-bottom: 0 !important;
          }

          /* ============================================ */
          /* PAGE SETUP - MINIMUM MARGINS                */
          /* ============================================ */
          @page {
            size: letter;
            margin: 0.25in;
            /* Slightly larger bottom margin so content doesn't pack into one fewer page (fixes PDF showing 2/5 when report is 2/6) */
            margin-bottom: 0.35in;
          }

          /* ============================================ */
          /* CROSS-PLATFORM PRINT STANDARDIZATION        */
          /* macOS appearance preserved, Windows matched */
          /* ============================================ */

          /* Preserve colors across platforms */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          /* Override container sizing for print - fit within minimum margins */
          /* Never print a surrounding border on the report container (custom or standard) */
          #report-container {
            min-height: 0 !important;
            max-height: none !important;
            height: auto !important;
            max-width: 7.5in !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 auto !important;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
          }

          /* Force remove any height constraints from the container */
          #report-container[style] {
            min-height: 0 !important;
            height: auto !important;
          }

          /* Content directly under header – no blank space: flex so body doesn't stretch */
          #report-container {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
          }
          #report-container > div:first-child {
            flex: 0 0 auto !important;
            margin-bottom: 4px !important;
            padding-bottom: 2px !important;
          }
          #report-container > div:nth-child(2),
          #report-container .report-body {
            flex: 0 0 auto !important;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #report-container .min-h-screen { min-height: 0 !important; }
          #report-container .report-body > * { margin-top: 0 !important; padding-top: 0 !important; }
          #report-container .report-body .custom-form-container {
            margin-top: 0 !important;
            padding-top: 0 !important;
          }
          #report-container .report-body .custom-form-container > div:first-child { display: none !important; }
          #report-container .report-body .custom-form-container > div:nth-child(2) {
            margin-top: 0 !important;
            padding-top: 0 !important;
          }

          /* Global: make inputs/selects look like plain text in print */
          #report-container input,
          #report-container select,
          #report-container textarea {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
            padding: 0 !important;
            margin: 0 !important;
            color: black !important;
            /* Windows Chrome form element fixes */
            outline: none !important;
            text-indent: 0 !important;
          }
          /* Preserve green/red PASS/FAIL text colors in print */
          #report-container .text-green-600 { color: #16a34a !important; }
          #report-container .text-red-600 { color: #dc2626 !important; }
          #report-container .result-pass { color: #16a34a !important; }
          #report-container .result-fail { color: #dc2626 !important; }
          #report-container select.result-pass { color: #16a34a !important; }
          #report-container select.result-fail { color: #dc2626 !important; }

          /* Hide select dropdown arrow - Windows & IE/Edge */
          #report-container select::-ms-expand { display: none !important; }
          #report-container select {
            background-image: none !important;
            padding-right: 0 !important;
          }

          /* Remove number input spinners - cross-browser */
          #report-container input[type="number"]::-webkit-outer-spin-button,
          #report-container input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
            display: none !important;
          }
          #report-container input[type="number"] {
            -moz-appearance: textfield !important;
          }
          #report-container input[type="number"]::-ms-clear { display: none !important; }

          /* ============================================ */
          /* TABLE BORDERS - Windows Chrome Enhancement */
          /* ============================================ */

          /* Enforce crisp table borders across all reports */
          #report-container table,
          #report-container th,
          #report-container td,
          #report-container thead,
          #report-container tbody,
          #report-container tr {
            border: 1px solid black !important;
            /* Windows-specific border rendering fixes */
            border-style: solid !important;
            border-width: 1px !important;
            border-color: #000000 !important;
          }

          #report-container table {
            border-collapse: collapse !important;
            width: 100% !important;
            max-width: 100% !important;
            /* Windows table rendering improvements */
            table-layout: auto !important;
            border-spacing: 0 !important;
            /* Allow tables to span multiple pages */
            overflow: visible !important;
          }

          /* ============================================ */
          /* PREVENT TABLE OVERFLOW - ALL REPORTS        */
          /* Force all tables to fit within page width   */
          /* ============================================ */

          /* Force overflow containers to show content, not scroll */
          #report-container .overflow-x-auto,
          #report-container .overflow-auto,
          #report-container [class*="overflow"] {
            overflow: visible !important;
            max-width: 100% !important;
          }

          /* All tables must fit within the printable area */
          #report-container table {
            max-width: 100% !important;
            width: 100% !important;
            table-layout: fixed !important;
            font-size: 9px !important;
          }
          /* CUSTOM FORMS: keep fixed layout (respects th widths exactly) but use proper font size */
          #report-container .custom-form-container table {
            table-layout: fixed !important;
            font-size: 10px !important;
          }

          /* All tables at full width - no scaling */
          #report-container table {
            width: 100% !important;
            transform: none !important;
            margin-bottom: 0 !important;
          }

          /* Prevent any element from causing horizontal overflow */
          #report-container * {
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          /* ============================================ */
          /* PREVENT BLANK PAGES                         */
          /* Remove excessive margins and page breaks    */
          /* ============================================ */

          /* Remove forced page breaks that cause blank pages */
          #report-container section,
          #report-container div,
          #report-container .mb-6,
          #report-container .mb-8 {
            page-break-before: auto !important;
            page-break-after: auto !important;
            break-before: auto !important;
            break-after: auto !important;
          }

          /* Only break inside large sections if needed */
          #report-container section,
          #report-container .section {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          /* Keep most table rows together */
          #report-container tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Allow explicit opt-out for very tall rows (e.g., long Results text) */
          #report-container tr.allow-row-break {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          /* Keep headers with content */
          #report-container h1, #report-container h2, #report-container h3 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          /* Reduce margins but not so much that print gets one fewer page than screen (keeps PDF page count in sync) */
          #report-container .mb-6 { margin-bottom: 16px !important; }
          #report-container .mb-8 { margin-bottom: 20px !important; }
          #report-container .mt-6 { margin-top: 12px !important; }
          #report-container .mt-8 { margin-top: 16px !important; }
          #report-container .py-6 { padding-top: 12px !important; padding-bottom: 12px !important; }
          #report-container .py-8 { padding-top: 16px !important; padding-bottom: 16px !important; }

          #report-container th, #report-container td {
            padding: 2px 3px !important;
            /* Windows text rendering in tables */
            line-height: 1.2 !important;
            vertical-align: top !important;
          }

          /* Standardize Visual/Mechanical tables that include a Results column */
          #report-container .vm-standard,
          #report-container .visual-mechanical-table { width: 100% !important; table-layout: fixed !important; }
          #report-container .vm-standard th,
          #report-container .vm-standard td,
          #report-container .visual-mechanical-table th,
          #report-container .visual-mechanical-table td {
            white-space: normal !important;
            word-break: break-word !important;
            font-size: 9px !important;
            line-height: 1.15 !important;
            padding: 3px 4px !important;
            vertical-align: top !important;
          }
          /* Column widths: small NETA Section, large Description, Results on right */
          #report-container .vm-standard thead th:first-child,
          #report-container .vm-standard tbody td:first-child,
          #report-container .visual-mechanical-table thead th:first-child,
          #report-container .visual-mechanical-table tbody td:first-child { width: 10% !important; text-align: left !important; }
          #report-container .vm-standard thead th:nth-child(2),
          #report-container .vm-standard tbody td:nth-child(2),
          #report-container .visual-mechanical-table thead th:nth-child(2),
          #report-container .visual-mechanical-table tbody td:nth-child(2) { width: 75% !important; text-align: left !important; }
          #report-container .vm-standard thead th:nth-child(3),
          #report-container .vm-standard tbody td:nth-child(3),
          #report-container .visual-mechanical-table thead th:nth-child(3),
          #report-container .visual-mechanical-table tbody td:nth-child(3) { width: 15% !important; text-align: center !important; }

          /* PASS/FAIL status styles for all reports (standard + custom) */
          .pass-fail-status-box {
            display: inline-block !important;
            padding: 4px 10px !important;
            font-size: 12px !important;
            font-weight: bold !important;
            text-align: center !important;
            width: fit-content !important;
            border-radius: 6px !important;
            box-sizing: border-box !important;
            min-width: 60px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color: #fff !important;
            border: 2px solid transparent !important;
            float: right !important;
          }
          .pass-fail-status-box.pass { background-color: #22c55e !important; border-color: #16a34a !important; }
          .pass-fail-status-box.fail { background-color: #ef4444 !important; border-color: #dc2626 !important; }
          .pass-fail-status-box.limited,
          .pass-fail-status-box.status-limited {
            background-color: #eab308 !important;
            border-color: #ca8a04 !important;
            color: #111827 !important;
          }

          /* ============================================ */
          /* CUSTOM FORM PRINT - mirror on-screen layout */
          /* ============================================ */

          /* Remove surrounding border on the wrapper */
          #report-container .custom-form-container,
          .custom-form-container {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            outline: none !important;
          }

          /* Tables: auto layout so column widths (10%, 30% etc.) are honoured */
          #report-container .custom-form-container table {
            table-layout: fixed !important;
            border-collapse: collapse !important;
            width: 100% !important;
            font-size: 10px !important;
            border: 1px solid #000 !important;
          }

          /* Borders on every cell */
          #report-container .custom-form-container th,
          #report-container .custom-form-container td,
          #report-container .custom-form-container thead,
          #report-container .custom-form-container tbody,
          #report-container .custom-form-container tr {
            border: 1px solid #000 !important;
          }

          /* Header cells – match on-screen padding & style */
          #report-container .custom-form-container th {
            padding: 6px 12px !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            text-align: left !important;
            background: #f9fafb !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Body cells – match on-screen padding */
          #report-container .custom-form-container td {
            padding: 6px 12px !important;
            font-size: 10px !important;
            vertical-align: top !important;
          }

          /* Text wrapping in print – match on-screen; no truncation/ellipsis */
          #report-container .custom-form-container th,
          #report-container .custom-form-container td {
            white-space: normal !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            overflow: visible !important;
            text-overflow: clip !important;
            min-width: 0 !important;
          }

          /* Field labels (CUSTOMER, SERIAL NUMBER, etc.) */
          #report-container .custom-form-container td div[class*="uppercase"] {
            font-size: 8px !important;
            font-weight: 600 !important;
            text-transform: uppercase !important;
            margin-bottom: 2px !important;
            color: #6b7280 !important;
          }

          /* Job details table (grouped fields): print clearly with fixed columns */
          #report-container .custom-form-container table.job-details-table {
            table-layout: fixed !important;
            width: 100% !important;
            font-size: 9px !important;
          }
          #report-container .custom-form-container table.job-details-table th,
          #report-container .custom-form-container table.job-details-table td {
            padding: 4px 6px !important;
            font-size: 9px !important;
            vertical-align: top !important;
            border: 1px solid #000 !important;
          }
          #report-container .custom-form-container table.job-details-table td div[class*="uppercase"],
          #report-container .custom-form-container table.job-details-table td .text-xs {
            font-size: 7px !important;
            margin-bottom: 1px !important;
          }
          #report-container .custom-form-container table.job-details-table input,
          #report-container .custom-form-container table.job-details-table select,
          #report-container .custom-form-container table.job-details-table textarea {
            font-size: 9px !important;
          }
          /* Temp °F/°C/Humidity: fit in one cell when printing – no clip, allow wrap if needed */
          #report-container .custom-form-container .temp-humidity-one-line {
            font-size: 7px !important;
            padding: 2px 3px !important;
            gap: 2px !important;
            min-width: 0 !important;
            overflow: visible !important;
            border: 1px solid #000 !important;
            flex-wrap: wrap !important;
          }
          #report-container .custom-form-container .temp-humidity-one-line input,
          #report-container .custom-form-container .temp-humidity-one-line span {
            font-size: 7px !important;
            min-width: 0 !important;
          }
          /* Keep TCF and Humidity visible in report/print – do not collapse */
          #report-container .custom-form-container .temp-humidity-one-line .temp-humidity-tcf,
          #report-container .custom-form-container .temp-humidity-one-line .temp-humidity-hum,
          #report-container .custom-form-container .temp-humidity-one-line .temp-humidity-c {
            min-width: 2em !important;
          }
          #report-container .custom-form-container .temp-humidity-one-line .temp-humidity-input {
            width: 2em !important;
            min-width: 1.8em !important;
            max-width: 2.5em !important;
            padding: 0 2px !important;
          }
          #report-container .custom-form-container td:has(.temp-humidity-one-line) {
            overflow: visible !important;
            min-width: 0 !important;
          }

          /* Inputs/selects/textareas rendered as plain text */
          #report-container .custom-form-container input,
          #report-container .custom-form-container select,
          #report-container .custom-form-container textarea {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 10px !important;
            color: #000 !important;
            -webkit-appearance: none !important;
            appearance: none !important;
            box-shadow: none !important;
            outline: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          /* Hide select arrow */
          #report-container .custom-form-container select::-ms-expand { display: none !important; }
          #report-container .custom-form-container select { background-image: none !important; }

          /* Section headings */
          #report-container .custom-form-container h2 {
            font-size: 11px !important;
            font-weight: 700 !important;
            margin-bottom: 4px !important;
            color: #000 !important;
          }

          /* Orange dividers */
          #report-container .custom-form-container div[class*="bg-[#f26722]"] {
            height: 3px !important;
            margin-bottom: 4px !important;
            background-color: #f26722 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Section spacing */
          #report-container .custom-form-container > div + div {
            margin-top: 12px !important;
          }

          /* Force-print toggle helpers for IR table */
          #report-container .ir-screen { display: none !important; }
          #report-container .ir-print { display: block !important; }
          #report-container .ir-print table { width: 100% !important; table-layout: fixed !important; }
          #report-container .ir-print th,
          #report-container .ir-print td { font-size: 9px !important; padding: 2px 3px !important; }

          /* ============================================ */
          /* WINDOWS-ONLY PRINT FIXES                   */
          /* Only apply when .is-windows class is present */
          /* ============================================ */

          .is-windows #report-container * {
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: optimizeLegibility !important;
            font-smooth: always !important;
          }

          .is-windows #report-container input,
          .is-windows #report-container select,
          .is-windows #report-container textarea {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
            padding: 0 !important;
            margin: 0 !important;
            color: black !important;
            /* Windows Chrome form element fixes */
            outline: none !important;
            text-indent: 0 !important;
          }

          .is-windows #report-container select::-ms-expand { display: none !important; }
          .is-windows #report-container select {
            background-image: none !important;
            padding-right: 0 !important;
          }

          .is-windows #report-container input[type="number"]::-webkit-outer-spin-button,
          .is-windows #report-container input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
            display: none !important;
          }
          .is-windows #report-container input[type="number"] {
            -moz-appearance: textfield !important;
          }
          .is-windows #report-container input[type="number"]::-ms-clear { display: none !important; }

          .is-windows #report-container table,
          .is-windows #report-container th,
          .is-windows #report-container td,
          .is-windows #report-container thead,
          .is-windows #report-container tbody,
          .is-windows #report-container tr {
            border: 1px solid black !important;
            /* Windows-specific border rendering fixes */
            border-style: solid !important;
            border-width: 1px !important;
            border-color: #000000 !important;
          }

          .is-windows #report-container table {
            border-collapse: collapse !important;
            width: 100% !important;
            /* Windows table rendering improvements */
            table-layout: auto !important;
            border-spacing: 0 !important;
          }

          .is-windows #report-container th, .is-windows #report-container td {
            padding: 2px 3px !important;
            /* Windows text rendering in tables */
            line-height: 1.2 !important;
            vertical-align: top !important;
          }

          /* ============================================ */
          /* ELECTRICAL TESTS TABLE - FIT TO PAGE       */
          /* Scale wide tables to fit minimum margins   */
          /* ============================================ */

          /* Container for electrical tests section - scale to fit */
          #report-container section[aria-labelledby="electrical-tests-heading"],
          #report-container .electrical-tests-section {
            width: 100% !important;
            max-width: 100% !important;
            overflow: visible !important;
          }

          /* Electrical tests table - full width, no scaling */
          #report-container .electrical-tests-table,
          #report-container table.electrical-tests-table {
            width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 8px !important;
            transform: none !important;
          }

          /* Electrical tests table headers */
          #report-container .electrical-tests-table th,
          #report-container table.electrical-tests-table th {
            font-size: 6px !important;
            padding: 1px !important;
            line-height: 1.1 !important;
            white-space: nowrap !important;
            overflow: visible !important;
            text-overflow: clip !important;
          }

          /* Electrical tests table cells */
          #report-container .electrical-tests-table td,
          #report-container table.electrical-tests-table td {
            font-size: 6px !important;
            padding: 1px !important;
            line-height: 1.1 !important;
            word-wrap: break-word !important;
            word-break: break-word !important;
            overflow: visible !important;
          }

          /* Electrical tests table inputs/textareas */
          #report-container .electrical-tests-table input,
          #report-container .electrical-tests-table textarea,
          #report-container .electrical-tests-table select,
          #report-container table.electrical-tests-table input,
          #report-container table.electrical-tests-table textarea,
          #report-container table.electrical-tests-table select {
            font-size: 6px !important;
            padding: 0 !important;
            margin: 0 !important;
            line-height: 1.1 !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          /* Overflow container should not scroll in print */
          #report-container .overflow-x-auto {
            overflow: visible !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          /* Force text wrapping in comment/conclusion/recommendation print boxes */
          #report-container table.print-comment-table,
          .is-windows #report-container table.print-comment-table,
          #report-container .comments-section table,
          #report-container .section-comments table,
          #report-container table.hidden.print\\:table,
          #report-container table.comments-print-table,
          #report-container div.hidden.print\\:block:not(.job-info-print) > table,
          #report-container h2.section-comments ~ table,
          #report-container h2.section-comments ~ div table {
            table-layout: fixed !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          #report-container table.print-comment-table td,
          .is-windows #report-container table.print-comment-table td,
          #report-container .comments-section textarea,
          #report-container .section-comments textarea,
          #report-container .comments-print-section textarea,
          #report-container .comments-section-print textarea,
          #report-container .comments-onscreen textarea,
          #report-container .visual-mechanical-comments textarea,
          #report-container .electrical-comments-section textarea,
          #report-container .comments-cell,
          #report-container .comments-text,
          #report-container .comments-section td,
          #report-container .section-comments td,
          #report-container .comments-section table td,
          #report-container .section-comments table td,
          #report-container .comments-section table td div,
          #report-container .section-comments table td div,
          #report-container .comments-print-section td,
          #report-container .comments-section-print table td,
          #report-container .comments-section-print table td div,
          #report-container table.hidden.print\\:table td,
          #report-container table.comments-print-table td,
          #report-container h2.section-comments ~ table td,
          #report-container h2.section-comments ~ div table td,
          #report-container div.hidden.print\\:block:not(.job-info-print) > table td,
          #report-container div.hidden.print\\:block:not(.job-info-print) > table td div,
          #report-container div.hidden.print\\:block:not(.job-info-print) h2 + table td,
          .is-windows #report-container table.print-comment-table td {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            white-space: pre-wrap !important;
            word-break: break-word !important;
            max-width: 100% !important;
            overflow: hidden !important;
          }
        }

        /* ============================================ */
        /* LIVE PREVIEW - Mirror print styles         */
        /* ============================================ */

        /* Windows-specific font rendering fixes for preview */
        .force-print * {
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
          font-smooth: always !important;
        }

        /* Preserve colors in preview */
        .force-print * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        /* A report preview is a paper document — always white, never dark mode.
           Dark mode applies a dark page background that bleeds through the
           (transparent) report sections; force the page surfaces white so the
           report's dark text stays readable. */
        html.force-print,
        .force-print body,
        .force-print #report-container,
        .force-print #report-container > div,
        .force-print #report-container section,
        .force-print #report-container table,
        .force-print #report-container thead,
        .force-print #report-container tbody,
        .force-print #report-container tr,
        .force-print #report-container td {
          background-color: #ffffff !important;
        }
        /* Form fields render as plain text on paper — clear any dark-mode fill so
           the white cell shows through (text color is handled elsewhere). */
        .force-print #report-container input,
        .force-print #report-container select,
        .force-print #report-container textarea {
          background-color: transparent !important;
        }

        .force-print #report-container {
          min-height: auto !important;
          padding: 10px 20px 20px 20px !important;
          margin: 0 auto !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }

        /* ============================================ */
        /* CUSTOM FORM PREVIEW - mirror on-screen      */
        /* ============================================ */
        .force-print #report-container .custom-form-container,
        .force-print .custom-form-container {
          border: none !important;
          box-shadow: none !important;
          outline: none !important;
          border-radius: 0 !important;
        }
        .force-print #report-container .custom-form-container table {
          table-layout: fixed !important;
          border-collapse: collapse !important;
          width: 100% !important;
          font-size: 10px !important;
          border: 1px solid #000 !important;
        }
        .force-print #report-container .custom-form-container th,
        .force-print #report-container .custom-form-container td,
        .force-print #report-container .custom-form-container thead,
        .force-print #report-container .custom-form-container tbody,
        .force-print #report-container .custom-form-container tr {
          border: 1px solid #000 !important;
        }
        .force-print #report-container .custom-form-container th {
          padding: 6px 12px !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          text-align: left !important;
          background: #f9fafb !important;
        }
        .force-print #report-container .custom-form-container td {
          padding: 6px 12px !important;
          font-size: 10px !important;
          vertical-align: top !important;
        }
        /* Text wrapping in print – match on-screen; no truncation/ellipsis */
        .force-print #report-container .custom-form-container th,
        .force-print #report-container .custom-form-container td {
          white-space: normal !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          overflow: visible !important;
          text-overflow: clip !important;
          min-width: 0 !important;
        }
        /* Job details table: print clearly with fixed columns */
        .force-print #report-container .custom-form-container table.job-details-table {
          table-layout: fixed !important;
          width: 100% !important;
          font-size: 9px !important;
        }
        .force-print #report-container .custom-form-container table.job-details-table th,
        .force-print #report-container .custom-form-container table.job-details-table td {
          padding: 4px 6px !important;
          font-size: 9px !important;
          vertical-align: top !important;
          border: 1px solid #000 !important;
        }
        .force-print #report-container .custom-form-container table.job-details-table td div[class*="uppercase"],
        .force-print #report-container .custom-form-container table.job-details-table td .text-xs {
          font-size: 7px !important;
          margin-bottom: 1px !important;
        }
        .force-print #report-container .custom-form-container table.job-details-table input,
        .force-print #report-container .custom-form-container table.job-details-table select,
        .force-print #report-container .custom-form-container table.job-details-table textarea {
          font-size: 9px !important;
        }
        /* Temp °F/°C/Humidity: fit in one cell – no clip, allow wrap if needed */
        .force-print #report-container .custom-form-container .temp-humidity-one-line {
          font-size: 7px !important;
          padding: 2px 3px !important;
          gap: 2px !important;
          min-width: 0 !important;
          overflow: visible !important;
          border: 1px solid #000 !important;
          flex-wrap: wrap !important;
        }
        .force-print #report-container .custom-form-container .temp-humidity-one-line input,
        .force-print #report-container .custom-form-container .temp-humidity-one-line span {
          font-size: 7px !important;
          min-width: 0 !important;
        }
        .force-print #report-container .custom-form-container .temp-humidity-one-line .temp-humidity-tcf,
        .force-print #report-container .custom-form-container .temp-humidity-one-line .temp-humidity-hum,
        .force-print #report-container .custom-form-container .temp-humidity-one-line .temp-humidity-c {
          min-width: 2em !important;
        }
        .force-print #report-container .custom-form-container .temp-humidity-one-line .temp-humidity-input {
          width: 2em !important;
          min-width: 1.8em !important;
          max-width: 2.5em !important;
          padding: 0 2px !important;
        }
        .force-print #report-container .custom-form-container td:has(.temp-humidity-one-line) {
          overflow: visible !important;
          min-width: 0 !important;
        }
        .force-print #report-container .custom-form-container input,
        .force-print #report-container .custom-form-container select,
        .force-print #report-container .custom-form-container textarea {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          font-size: 10px !important;
          color: #000 !important;
          -webkit-appearance: none !important;
          appearance: none !important;
          box-shadow: none !important;
          outline: none !important;
        }

        .force-print #report-container input,
        .force-print #report-container select,
        .force-print #report-container textarea {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          padding: 0 !important;
          margin: 0 !important;
          color: black !important;
          outline: none !important;
          text-indent: 0 !important;
        }

        .force-print #report-container select::-ms-expand { display: none !important; }
        .force-print #report-container select {
          background-image: none !important;
          padding-right: 0 !important;
        }

        .force-print #report-container input[type="number"]::-webkit-outer-spin-button,
        .force-print #report-container input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
        }
        .force-print #report-container input[type="number"] {
          -moz-appearance: textfield !important;
        }
        .force-print #report-container input[type="number"]::-ms-clear { display: none !important; }

        .force-print #report-container table,
        .force-print #report-container th,
        .force-print #report-container td,
        .force-print #report-container thead,
        .force-print #report-container tbody,
        .force-print #report-container tr {
          border: 1px solid black !important;
          border-style: solid !important;
          border-width: 1px !important;
          border-color: #000000 !important;
        }

        .force-print #report-container table {
          border-collapse: collapse !important;
          width: 100% !important;
          max-width: 100% !important;
          table-layout: auto !important;
          border-spacing: 0 !important;
          overflow: visible !important; /* Allow tables to span multiple pages */
        }

        /* PREVENT TABLE OVERFLOW - force-print mode */
        .force-print #report-container .overflow-x-auto,
        .force-print #report-container .overflow-auto,
        .force-print #report-container [class*="overflow"] {
          overflow: visible !important;
          max-width: 100% !important;
        }

        .force-print #report-container table {
          max-width: 100% !important;
          width: 100% !important;
          table-layout: fixed !important;
        }
        /* CUSTOM FORMS: keep fixed layout (respects th widths exactly) but proper font */
        .force-print #report-container .custom-form-container table {
          table-layout: fixed !important;
          font-size: 10px !important;
        }

        /* All tables at full width - no scaling */
        .force-print #report-container table {
          width: 100% !important;
          transform: none !important;
          margin-bottom: 0 !important;
        }

        /* Prevent any element from causing horizontal overflow */
        .force-print #report-container * {
          max-width: 100% !important;
          box-sizing: border-box !important;
        }

        /* PREVENT BLANK PAGES - force-print mode */
        .force-print #report-container section,
        .force-print #report-container div,
        .force-print #report-container .mb-6,
        .force-print #report-container .mb-8 {
          page-break-before: auto !important;
          page-break-after: auto !important;
        }

        .force-print #report-container .mb-6 { margin-bottom: 12px !important; }
        .force-print #report-container .mb-8 { margin-bottom: 16px !important; }

        .force-print #report-container th,
        .force-print #report-container td {
          padding: 2px 3px !important;
          line-height: 1.2 !important;
          vertical-align: top !important;
        }

        .force-print #report-container .vm-standard,
        .force-print #report-container .visual-mechanical-table { width: 100% !important; table-layout: fixed !important; }
        .force-print #report-container .vm-standard th,
        .force-print #report-container .vm-standard td,
        .force-print #report-container .visual-mechanical-table th,
        .force-print #report-container .visual-mechanical-table td {
          white-space: normal !important;
          word-break: break-word !important;
          font-size: 9px !important;
          line-height: 1.15 !important;
          padding: 3px 4px !important;
          vertical-align: top !important;
        }
        .force-print #report-container .vm-standard thead th:first-child,
        .force-print #report-container .vm-standard tbody td:first-child,
        .force-print #report-container .visual-mechanical-table thead th:first-child,
        .force-print #report-container .visual-mechanical-table tbody td:first-child { width: 10% !important; text-align: left !important; }
        .force-print #report-container .vm-standard thead th:nth-child(2),
        .force-print #report-container .vm-standard tbody td:nth-child(2),
        .force-print #report-container .visual-mechanical-table thead th:nth-child(2),
        .force-print #report-container .visual-mechanical-table tbody td:nth-child(2) { width: 75% !important; text-align: left !important; }
        .force-print #report-container .vm-standard thead th:nth-child(3),
        .force-print #report-container .vm-standard tbody td:nth-child(3),
        .force-print #report-container .visual-mechanical-table thead th:nth-child(3),
        .force-print #report-container .visual-mechanical-table tbody td:nth-child(3) { width: 15% !important; text-align: center !important; }

        /* PASS/FAIL status styles for force-print mode */
        .force-print .pass-fail-status-box {
          display: inline-block !important;
          padding: 4px 10px !important;
          font-size: 12px !important;
          font-weight: bold !important;
          text-align: center !important;
          width: fit-content !important;
          border-radius: 6px !important;
          box-sizing: border-box !important;
          min-width: 60px !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color: #fff !important;
          border: 2px solid transparent !important;
          float: right !important;
        }
        .force-print .pass-fail-status-box.pass { background-color: #22c55e !important; border-color: #16a34a !important; }
        .force-print .pass-fail-status-box.fail { background-color: #ef4444 !important; border-color: #dc2626 !important; }
        .force-print .pass-fail-status-box.limited,
        .force-print .pass-fail-status-box.status-limited {
          background-color: #eab308 !important;
          border-color: #ca8a04 !important;
          color: #111827 !important;
        }

        /* Preserve green/red PASS/FAIL text colors in print (overrides blanket color:black on form elements) */
        .force-print #report-container .text-green-600 { color: #16a34a !important; }
        .force-print #report-container .text-red-600 { color: #dc2626 !important; }
        .force-print #report-container .result-pass { color: #16a34a !important; }
        .force-print #report-container .result-fail { color: #dc2626 !important; }
        .force-print #report-container select.result-pass { color: #16a34a !important; }
        .force-print #report-container select.result-fail { color: #dc2626 !important; }

        .force-print #report-container .ir-screen { display: none !important; }
        .force-print #report-container .ir-print { display: block !important; }
        .force-print #report-container .ir-print table { width: 100% !important; table-layout: fixed !important; }
        .force-print #report-container .ir-print th,
        .force-print #report-container .ir-print td { font-size: 9px !important; padding: 2px 3px !important; }

        /* ============================================ */
        /* ELECTRICAL TESTS TABLE - FIT TO PAGE       */
        /* Scale wide tables to fit minimum margins   */
        /* ============================================ */

        .force-print #report-container section[aria-labelledby="electrical-tests-heading"],
        .force-print #report-container .electrical-tests-section {
          width: 100% !important;
          max-width: 100% !important;
          overflow: visible !important;
        }

        .force-print #report-container .electrical-tests-table,
        .force-print #report-container table.electrical-tests-table {
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
          font-size: 8px !important;
          transform: none !important;
        }

        .force-print #report-container .electrical-tests-table th,
        .force-print #report-container table.electrical-tests-table th {
          font-size: 6px !important;
          padding: 1px !important;
          line-height: 1.1 !important;
          white-space: nowrap !important;
          overflow: visible !important;
          text-overflow: clip !important;
        }

        .force-print #report-container .electrical-tests-table td,
        .force-print #report-container table.electrical-tests-table td {
          font-size: 6px !important;
          padding: 1px !important;
          line-height: 1.1 !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
          overflow: visible !important;
        }

        .force-print #report-container .electrical-tests-table input,
        .force-print #report-container .electrical-tests-table textarea,
        .force-print #report-container .electrical-tests-table select,
        .force-print #report-container table.electrical-tests-table input,
        .force-print #report-container table.electrical-tests-table textarea,
        .force-print #report-container table.electrical-tests-table select {
          font-size: 6px !important;
          padding: 0 !important;
          margin: 0 !important;
          line-height: 1.1 !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        .force-print #report-container .overflow-x-auto {
          overflow: visible !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        /* Force text wrapping in comment/conclusion/recommendation print boxes */
        .force-print #report-container table.print-comment-table,
        .force-print.is-windows #report-container table.print-comment-table,
        .force-print #report-container .comments-section table,
        .force-print #report-container .section-comments table,
        .force-print #report-container table.hidden.print\\:table,
        .force-print #report-container table.comments-print-table,
        .force-print #report-container div.hidden.print\\:block:not(.job-info-print) > table,
        .force-print #report-container h2.section-comments ~ table,
        .force-print #report-container h2.section-comments ~ div table {
          table-layout: fixed !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        .force-print #report-container table.print-comment-table td,
        .force-print.is-windows #report-container table.print-comment-table td,
        .force-print #report-container .comments-section textarea,
        .force-print #report-container .section-comments textarea,
        .force-print #report-container .comments-print-section textarea,
        .force-print #report-container .comments-section-print textarea,
        .force-print #report-container .comments-onscreen textarea,
        .force-print #report-container .visual-mechanical-comments textarea,
        .force-print #report-container .electrical-comments-section textarea,
        .force-print #report-container .comments-cell,
        .force-print #report-container .comments-text,
        .force-print #report-container .comments-section td,
        .force-print #report-container .section-comments td,
        .force-print #report-container .comments-section table td,
        .force-print #report-container .section-comments table td,
        .force-print #report-container .comments-section table td div,
        .force-print #report-container .section-comments table td div,
        .force-print #report-container .comments-print-section td,
        .force-print #report-container .comments-section-print table td,
        .force-print #report-container .comments-section-print table td div,
        .force-print #report-container table.hidden.print\\:table td,
        .force-print #report-container table.comments-print-table td,
        .force-print #report-container h2.section-comments ~ table td,
        .force-print #report-container h2.section-comments ~ div table td,
        .force-print #report-container div.hidden.print\\:block:not(.job-info-print) > table td,
        .force-print #report-container div.hidden.print\\:block:not(.job-info-print) > table td div,
        .force-print #report-container div.hidden.print\\:block:not(.job-info-print) h2 + table td {
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          white-space: pre-wrap !important;
          word-break: break-word !important;
          max-width: 100% !important;
          overflow: hidden !important;
        }

        /* Hide all buttons and controls in force-print mode (for embedded deliverable viewer) */
        .force-print button:not(.print-visible) { display: none !important; }

        /* Hide ONLY specific UI elements, NOT .print:hidden which might contain data */
        .force-print nav,
        .force-print aside,
        .force-print header:not(#report-container header),
        .force-print [role="navigation"],
        .force-print .sidebar,
        .force-print .navigation,
        .force-print .nav-menu { display: none !important; }

        /* Make report container fit within minimum margins (0.25in each side = 8in printable) */
        .force-print #report-container {
          max-width: 7.5in !important;
          width: 7.5in !important;
          margin: 0 auto !important;
          min-height: auto !important;
          box-sizing: border-box !important;
          overflow: visible !important;
          padding: 10px !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }
        /* Content directly under header – no blank space: flex so body doesn't stretch */
        .force-print #report-container {
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
        }
        .force-print #report-container > div:first-child {
          flex: 0 0 auto !important;
          margin-bottom: 4px !important;
          padding-bottom: 2px !important;
        }
        .force-print #report-container > div:nth-child(2),
        .force-print #report-container .report-body {
          flex: 0 0 auto !important;
          min-height: 0 !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .force-print #report-container .min-h-screen { min-height: 0 !important; }
        .force-print #report-container .report-body > * { margin-top: 0 !important; padding-top: 0 !important; }
        .force-print #report-container .report-body .custom-form-container {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        .force-print #report-container .report-body .custom-form-container > div:first-child { display: none !important; }
        .force-print #report-container .report-body .custom-form-container > div:nth-child(2) {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }

        /* Ensure report content fits within 8.5" width */
        .force-print #report-container > * {
          max-width: 100% !important;
          box-sizing: border-box !important;
        }

        /* Tables should scale to fit within page width */
        .force-print #report-container table {
          max-width: 100% !important;
          width: 100% !important;
          table-layout: auto !important;
        }

        /* Prevent table cells from expanding beyond container */
        .force-print #report-container th,
        .force-print #report-container td {
          max-width: 100% !important;
          overflow: visible !important;
          word-wrap: break-word !important;
        }

        /* Ensure sections don't overflow but ARE visible (allow multi-page) */
        .force-print #report-container section {
          max-width: 100% !important;
          overflow: visible !important;
        }

        /* Scale down content if needed to fit 8.5" width */
        @media screen {
          .force-print #report-container {
            transform-origin: top center;
          }
        }

        /* Ensure ALL content sections are visible in embedded mode - comprehensive */
        /* But NOT the onscreen editable versions */
        .force-print #report-container section:not([class*="onscreen"]),
        .force-print #report-container div[class*="section"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="-data"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="-info"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="information"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="results"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="test"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="equipment"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="device"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="nameplate"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="comments"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="visual"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="mechanical"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="electrical"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="as-found"]:not([class*="onscreen"]),
        .force-print #report-container div[class*="as-left"]:not([class*="onscreen"]) {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* Show ALL print variants - catch any class ending in -print or containing print */
        .force-print .print\\:block,
        .force-print .hidden.print\\:block,
        .force-print [class*="-print"],
        .force-print [class*="print-"] {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* Force ALL tables and table elements to be visible */
        .force-print #report-container table { display: table !important; visibility: visible !important; opacity: 1 !important; }
        .force-print #report-container thead { display: table-header-group !important; }
        .force-print #report-container tbody { display: table-row-group !important; }
        .force-print #report-container tfoot { display: table-footer-group !important; }
        .force-print #report-container tr { display: table-row !important; }
        .force-print #report-container th,
        .force-print #report-container td { display: table-cell !important; visibility: visible !important; }

        /* Ensure any data container divs are visible */
        .force-print #report-container [class*="data"],
        .force-print #report-container [class*="content"],
        .force-print #report-container [class*="body"] {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* Safety net: ensure all divs inside report container are visible unless specifically hidden */
        .force-print #report-container > div,
        .force-print #report-container section > div,
        .force-print #report-container article > div {
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* Hide ALL on-screen form versions - they have editable inputs/selects */
        .force-print .print\\:hidden { display: none !important; }
        .force-print [class*="-onscreen"],
        .force-print [class*="onscreen-"],
        .force-print .job-info-onscreen,
        .force-print .nameplate-onscreen,
        .force-print .test-eqpt-onscreen,
        .force-print .device-onscreen {
          display: none !important;
        }

        /* More aggressive: if a section is NOT marked as print version, hide it completely */
        .force-print #report-container .job-information:not(.job-info-print):not(.print\\:block),
        .force-print #report-container .test-equipment:not(.test-eqpt-print):not(.print\\:block),
        .force-print #report-container .nameplate-data:not(.nameplate-print):not(.print\\:block),
        .force-print #report-container .device-data:not(.device-print):not(.print\\:block),
        .force-print #report-container .device-information:not(.device-print):not(.print\\:block) {
          display: none !important;
        }

        /* But ensure their print counterparts (clean tables) are visible */
        .force-print .print\\:block,
        .force-print [class*="-print"]:not([class*="no-print"]),
        .force-print [class*="print-"]:not([class*="no-print"]),
        .force-print .job-info-print,
        .force-print .nameplate-print,
        .force-print .test-eqpt-print,
        .force-print .device-print {
          display: block !important;
          visibility: visible !important;
        }
        .force-print .print\\:flex,
        .force-print .hidden.print\\:flex {
          display: flex !important;
          visibility: visible !important;
        }
        .force-print .print\\:grid,
        .force-print .hidden.print\\:grid {
          display: grid !important;
          visibility: visible !important;
        }
        .force-print .print\\:table,
        .force-print .hidden.print\\:table {
          display: table !important;
          visibility: visible !important;
        }

        /* ============================================ */
        /* WINDOWS-ONLY LIVE PREVIEW FIXES              */
        /* Only apply when both .force-print and .is-windows */
        /* ============================================ */

        .force-print.is-windows #report-container * {
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
          font-smooth: always !important;
        }

        .force-print.is-windows #report-container input,
        .force-print.is-windows #report-container select,
        .force-print.is-windows #report-container textarea {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          padding: 0 !important;
          margin: 0 !important;
          color: black !important;
          outline: none !important;
          text-indent: 0 !important;
        }

        .force-print.is-windows #report-container select::-ms-expand { display: none !important; }
        .force-print.is-windows #report-container select {
          background-image: none !important;
          padding-right: 0 !important;
        }

        .force-print.is-windows #report-container input[type="number"]::-webkit-outer-spin-button,
        .force-print.is-windows #report-container input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
        }
        .force-print.is-windows #report-container input[type="number"] {
          -moz-appearance: textfield !important;
        }
        .force-print.is-windows #report-container input[type="number"]::-ms-clear { display: none !important; }

        .force-print.is-windows #report-container table,
        .force-print.is-windows #report-container th,
        .force-print.is-windows #report-container td,
        .force-print.is-windows #report-container thead,
        .force-print.is-windows #report-container tbody,
        .force-print.is-windows #report-container tr {
          border: 1px solid black !important;
          border-style: solid !important;
          border-width: 1px !important;
          border-color: #000000 !important;
        }

        .force-print.is-windows #report-container table {
          border-collapse: collapse !important;
          width: 100% !important;
          table-layout: auto !important;
          border-spacing: 0 !important;
        }

        .force-print.is-windows #report-container th,
        .force-print.is-windows #report-container td {
          padding: 2px 3px !important;
          line-height: 1.2 !important;
          vertical-align: top !important;
        }

        /* --- Mobile responsiveness for common report headers and job info grids --- */
        @media (max-width: 640px) {
          /* Standard header container used across reports */
          #report-container .print\\:hidden.flex.justify-between.items-center.mb-6 {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.75rem !important; /* ~gap-3 */
          }
          #report-container .print\\:hidden.flex.justify-between.items-center.mb-6 > h1 {
            font-size: 1.25rem !important; /* text-xl */
            line-height: 1.75rem !important; /* leading-7 */
            overflow-wrap: anywhere !important; /* break long titles */
          }
          #report-container .print\\:hidden.flex.justify-between.items-center.mb-6 > div {
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            gap: 0.5rem !important; /* gap-2 */
          }

          /* Fallback for headers without the print:hidden class but with the same layout */
          #report-container .flex.justify-between.items-center.mb-6 {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.75rem !important;
          }
          #report-container .flex.justify-between.items-center.mb-6 > h1 {
            font-size: 1.25rem !important;
            line-height: 1.75rem !important;
            overflow-wrap: anywhere !important;
          }
          #report-container .flex.justify-between.items-center.mb-6 > div {
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            gap: 0.5rem !important;
          }

          /* Collapse common two-column grids on small screens */
          #report-container .grid.grid-cols-2 { grid-template-columns: 1fr !important; }
        }

        /* ============================================ */
        /* REPORT LOCKED STATE                         */
        /* Prevents editing when report is approved/sent */
        /* ============================================ */
        #report-container.report-locked input,
        #report-container.report-locked select,
        #report-container.report-locked textarea {
          pointer-events: none !important;
          opacity: 0.85 !important;
          cursor: not-allowed !important;
        }
      `;
      document.head.appendChild(style);
    }

    const standardizeVMTables = () => {
      const container = document.getElementById("report-container");
      if (!container) return;
      const tables = Array.from(
        container.querySelectorAll("table"),
      ) as HTMLTableElement[];
      tables.forEach((tbl) => {
        const headerCells = Array.from(
          tbl.querySelectorAll("thead th"),
        ) as HTMLTableCellElement[];
        if (!headerCells.length) return;
        const headerTexts = headerCells.map((th) =>
          (th.textContent || "").trim().toLowerCase(),
        );
        const hasNetaSection = headerTexts.some(
          (t) => t.includes("neta") || t.includes("section"),
        );
        const hasDescription = headerTexts.some((t) =>
          t.includes("description"),
        );
        const resultsIndex = headerTexts.findIndex(
          (t) => t === "results" || t === "result",
        );
        if (hasNetaSection && hasDescription && resultsIndex >= 0) {
          // Tag this table for standardized print layout
          tbl.classList.add("vm-standard");
          // Hide comments column if present
          const commentsIndex = headerTexts.findIndex((t) =>
            t.includes("comment"),
          );
          if (commentsIndex >= 0) {
            const rows = Array.from(
              tbl.querySelectorAll("tr"),
            ) as HTMLTableRowElement[];
            rows.forEach((row) => {
              const cells = Array.from(
                row.querySelectorAll("th,td"),
              ) as HTMLElement[];
              const cell = cells[commentsIndex];
              if (cell) cell.style.display = "none";
            });
          }
        }
      });
    };

    // Strip numeric prefixes like "3- ", "4.", etc. from report titles only for print
    const stripTitlePrefixesForPrint = () => {
      const container = document.getElementById("report-container");
      if (!container) return;
      const titleSelectors = ["h1", "h2", ".section-header"];
      const regex = /^\s*\d+\s*[-.]\s*/i;
      titleSelectors.forEach((sel) => {
        const nodes = Array.from(
          container.querySelectorAll(sel),
        ) as HTMLElement[];
        nodes.forEach((el) => {
          const current = el.textContent || "";
          if (!current) return;
          if (regex.test(current)) {
            if (!el.dataset.originalTitle) {
              el.dataset.originalTitle = current;
            }
            el.textContent = current.replace(regex, "").trim();
          }
        });
      });
    };

    // Restore titles after printing
    const restoreTitlesAfterPrint = () => {
      const container = document.getElementById("report-container");
      if (!container) return;
      const nodes = Array.from(
        container.querySelectorAll("[data-original-title]"),
      ) as HTMLElement[];
      nodes.forEach((el) => {
        if (el.dataset.originalTitle) {
          el.textContent = el.dataset.originalTitle;
          delete el.dataset.originalTitle;
        }
      });
    };

    // Run on mount and before print
    if (typeof window !== "undefined") {
      standardizeVMTables();
      const beforeHandler = () => {
        standardizeVMTables();
        stripTitlePrefixesForPrint();
      };
      const afterHandler = () => {
        restoreTitlesAfterPrint();
      };
      window.addEventListener("beforeprint", beforeHandler);
      window.addEventListener("afterprint", afterHandler);
      return () => {
        window.removeEventListener("beforeprint", beforeHandler);
        window.removeEventListener("afterprint", afterHandler);
      };
    }
  }, []);

  // Global lock state: track whether this report is approved/sent
  const [isReportLocked, setIsReportLocked] = React.useState(false);

  // Global lock check: fully lock reports that are approved or sent
  useEffect(() => {
    let isCancelled = false;

    const derivePathParts = () => {
      if (typeof window === "undefined") return null;
      const parts = (window.location?.pathname || "")
        .split("/")
        .filter(Boolean);
      // Expecting /jobs/:jobId/:slug/:reportId
      const jobsIdx = parts.indexOf("jobs");
      if (jobsIdx === -1 || parts.length < jobsIdx + 4) return null;
      const jobId = parts[jobsIdx + 1];
      const slug = parts[jobsIdx + 2];
      const reportId = parts[jobsIdx + 3];
      if (!jobId || !slug || !reportId) return null;
      return { jobId, slug, reportId };
    };

    const checkLockStatus = async () => {
      const parts = derivePathParts();
      if (!parts) return;
      const { jobId, slug, reportId } = parts;

      try {
        // The approval status is stored directly on the assets table (assets.status)
        // Look up the asset by its file_url which follows the pattern: report:/jobs/{jobId}/{slug}/{reportId}
        const fileUrl = `report:/jobs/${jobId}/${slug}/${reportId}`;
        const { data: asset } = await supabase
          .schema("neta_ops")
          .from("assets")
          .select("id, status")
          .eq("file_url", fileUrl)
          .maybeSingle();

        let assetStatus: string | null = (asset as any)?.status || null;

        // If exact match didn't find it, try broader suffix match
        if (!assetStatus) {
          const { data: assetsBySuffix } = await supabase
            .schema("neta_ops")
            .from("assets")
            .select("id, status, file_url")
            .ilike("file_url", `%/${reportId}`);
          if (Array.isArray(assetsBySuffix) && assetsBySuffix.length > 0) {
            // Prefer report:/ URLs that match our job
            const candidate =
              assetsBySuffix.find((a) =>
                (a.file_url || "").startsWith(`report:/jobs/${jobId}/`),
              ) ||
              assetsBySuffix.find((a) =>
                (a.file_url || "").startsWith("report:/jobs/"),
              ) ||
              assetsBySuffix[0];
            assetStatus = (candidate as any)?.status || null;
          }
        }

        if (!isCancelled) {
          const s = String(assetStatus || "").toLowerCase();
          if (s === "approved" || s === "sent") {
            setIsReportLocked(true);
          }
        }
      } catch {
        // Silent fallback
      }
    };

    if (typeof window !== "undefined") {
      checkLockStatus();
    }

    return () => {
      isCancelled = true;
    };
  }, []);

  // Comprehensive DOM-level lock enforcement via MutationObserver
  // This ensures ALL form elements stay disabled/readOnly even through React re-renders
  useEffect(() => {
    if (!isReportLocked) return;

    const lockContainer = () => {
      const container = document.getElementById("report-container");
      if (!container) return;

      // Disable all inputs, selects, textareas (only set if not already locked to avoid extra mutations)
      const formElements = container.querySelectorAll(
        "input, select, textarea",
      );
      formElements.forEach((el) => {
        const element = el as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement;
        if (element.tagName === "SELECT") {
          if (!(element as HTMLSelectElement).disabled)
            (element as HTMLSelectElement).disabled = true;
        } else {
          const input = element as HTMLInputElement;
          if (!input.readOnly) input.readOnly = true;
          if (!input.disabled) input.disabled = true;
        }
        if (element.style.pointerEvents !== "none")
          element.style.pointerEvents = "none";
      });

      // Hide Edit Report, Save Report, and similar action buttons
      const buttons = Array.from(
        container.querySelectorAll("button"),
      ) as HTMLButtonElement[];
      buttons.forEach((btn) => {
        const text = (btn.textContent || "").trim().toLowerCase();
        if (
          text === "edit report" ||
          text === "save report" ||
          text === "save" ||
          text === "save & close" ||
          text === "add row" ||
          text === "add bus section" ||
          text === "add test" ||
          text === "add section" ||
          text === "remove" ||
          text === "delete" ||
          text === "mark ready to review" ||
          text === "mark as ready to review" ||
          text === "submit for review" ||
          text.startsWith("add ") ||
          text.startsWith("remove ") ||
          text.startsWith("delete ")
        ) {
          btn.style.display = "none";
        }
        // Also disable PASS/FAIL toggle buttons
        if (text === "pass" || text === "fail") {
          btn.disabled = true;
          btn.style.pointerEvents = "none";
          btn.style.cursor = "not-allowed";
        }
      });
    };

    // Run immediately
    lockContainer();

    // Use MutationObserver to re-enforce when new nodes are added (e.g. React re-renders).
    // Do NOT observe attributes (disabled/readOnly) — we set those ourselves, which would
    // retrigger the observer and cause an infinite loop that freezes the tab.
    const container = document.getElementById("report-container");
    let observer: MutationObserver | null = null;
    if (container) {
      observer = new MutationObserver(() => {
        lockContainer();
      });
      observer.observe(container, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [isReportLocked]);

  // If a page is opened directly with ?preview=true or ?embedded=true, render in print-look mode and disable nested preview
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isPreviewQuery = params.get("preview") === "true";
    const isEmbeddedQuery = params.get("embedded") === "true";
    if (isPreviewQuery || isEmbeddedQuery) {
      document.documentElement.classList.add("force-print");
    }
  }, []);

  return (
    <div
      id="report-container"
      data-report-locked={isReportLocked ? "true" : undefined}
      className={`w-full max-w-4xl mx-auto p-6 pb-20 ${isPrintMode ? "print-mode" : ""} ${isReportLocked ? "report-locked" : ""} overflow-x-auto screen-min-height`}
    >
      {/* Locked banner is shown once by Layout.tsx for all report pages */}
      {children}
    </div>
  );
};
