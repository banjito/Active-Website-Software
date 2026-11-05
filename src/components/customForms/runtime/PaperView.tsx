/**
 * Paper view.
 *
 * Shows a custom form on screen as close to its printout as possible while it
 * stays fillable: the sheet is locked to US Letter (8.5in wide, with the same
 * 7.5in content width the print stylesheet uses), always white, and the
 * custom-form print typography (10px tables, black cell borders, 11px section
 * headings, flat inputs) is applied on screen.
 *
 * Screen-only controls (add row, settings dropdowns, the toolbar) stay visible,
 * so the form can still be worked on. Everything here is `@media screen`, so
 * printing is driven by the real print stylesheet alone.
 *
 * The values below mirror the "CUSTOM FORM PRINT" block in ReportWrapper.tsx.
 * If those change, change these too.
 */

import React from "react";
import { FileText } from "lucide-react";

const STORAGE_KEY = "customForms.paperView";

/** Class on the wrapper that turns paper view on. */
export const PAPER_CLASS = "cf-paper";
/** Class for the toolbar, which keeps its normal app styling inside the sheet. */
export const PAPER_TOOLBAR_CLASS = "cf-toolbar";

const ZOOMS = [1, 1.25, 1.5];

interface PaperViewState {
  on: boolean;
  zoom: number;
}

function readState(): PaperViewState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        on: parsed.on !== false,
        zoom: ZOOMS.includes(parsed.zoom) ? parsed.zoom : 1.25,
      };
    }
  } catch {
    /* storage unavailable */
  }
  // On by default: the team asked to see the printout while they work.
  return { on: true, zoom: 1.25 };
}

/** Paper view on/off and zoom, remembered per browser. */
export function usePaperView() {
  const [state, setState] = React.useState<PaperViewState>(readState);
  const update = (patch: Partial<PaperViewState>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  return {
    on: state.on,
    zoom: state.zoom,
    setOn: (on: boolean) => update({ on }),
    setZoom: (zoom: number) => update({ zoom }),
    /**
     * Style for the sheet. Zoom is passed as a variable and only applied in the
     * screen stylesheet, so it never scales the printout. `zoom` scales without
     * reflowing, so line wrapping stays true to paper.
     */
    sheetStyle: state.on
      ? ({ "--cf-zoom": String(state.zoom) } as React.CSSProperties)
      : undefined,
  };
}

/** Toggle + zoom picker for a form's toolbar. */
export const PaperViewToggle: React.FC<{
  paper: ReturnType<typeof usePaperView>;
}> = ({ paper }) => (
  <div className="flex items-center border border-neutral-300 dark:border-neutral-600 rounded-none">
    <button
      type="button"
      onClick={() => paper.setOn(!paper.on)}
      className={`flex items-center gap-1.5 h-10 px-3 text-sm rounded-none ${
        paper.on
          ? "bg-brand/10 text-brand font-medium"
          : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-100"
      }`}
      title={
        paper.on
          ? "Showing the form as it will print. Click for the regular screen view."
          : "Show the form as it will print (letter size)"
      }
      aria-pressed={paper.on}
    >
      <FileText className="w-4 h-4" />
      Paper view
    </button>
    {paper.on && (
      <select
        value={paper.zoom}
        onChange={(e) => paper.setZoom(Number(e.target.value))}
        title="Zoom (does not change how it prints)"
        className="h-10 px-1 text-sm bg-transparent border-l border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 focus:outline-none"
      >
        {ZOOMS.map((z) => (
          <option key={z} value={z}>
            {Math.round(z * 100)}%
          </option>
        ))}
      </select>
    )}
  </div>
);

const P = `.${PAPER_CLASS}`;
const SHEET = `${P} .custom-form-container`;
/** Everything in the sheet except the toolbar. */
const NOT_TB = `:not(.${PAPER_TOOLBAR_CLASS}, .${PAPER_TOOLBAR_CLASS} *)`;

const PAPER_CSS = `
@media screen {
  /* Let the sheet be wider than the report column when zoomed. */
  #report-container:has(${P}) { max-width: none !important; }
  ${P} { overflow-x: auto; }

  /* The sheet: letter width, 0.5in side margins = the 7.5in print content width.
     The side padding gives back the 1px border, or tables come out 2px narrow. */
  ${SHEET} {
    width: 8.5in !important;
    max-width: none !important;
    min-height: 11in;
    margin: 0 auto !important;
    padding: 0.25in calc(0.5in - 1px) 0.5in !important;
    box-sizing: border-box !important;
    background: #fff !important;
    color: #000 !important;
    border: 1px solid #d4d4d4 !important;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18) !important;
    zoom: var(--cf-zoom, 1);
  }
  ${SHEET} > .${PAPER_TOOLBAR_CLASS} { zoom: 0.8; }

  /* Tables */
  ${SHEET} table {
    table-layout: fixed !important;
    border-collapse: collapse !important;
    width: 100% !important;
    font-size: 10px !important;
    border: 1px solid #000 !important;
  }
  ${SHEET} th, ${SHEET} td, ${SHEET} thead, ${SHEET} tbody, ${SHEET} tr {
    border: 1px solid #000 !important;
  }
  ${SHEET} th {
    padding: 6px 12px !important;
    font-size: 10px !important;
    font-weight: 600 !important;
    text-align: left !important;
    background: #f9fafb !important;
    color: #000 !important;
  }
  ${SHEET} td {
    padding: 6px 12px !important;
    font-size: 10px !important;
    vertical-align: top !important;
  }
  ${SHEET} th, ${SHEET} td {
    white-space: normal !important;
    overflow-wrap: break-word !important;
    overflow: visible !important;
    text-overflow: clip !important;
    min-width: 0 !important;
  }
  /* Windows print (the .is-windows rules in ReportWrapper) sizes columns by
     their content and uses tight cells. Mirror it, or columns come out equal
     width and headers break mid-word. */
  .is-windows ${SHEET} table { table-layout: auto !important; }
  .is-windows ${SHEET} th,
  .is-windows ${SHEET} td {
    padding: 2px 3px !important;
    line-height: 1.2 !important;
    vertical-align: top !important;
  }
  .is-windows ${SHEET} th *,
  .is-windows ${SHEET} td * { line-height: 1.2 !important; }
  /* That sizing reads the printed text, so keep it in the layout, unseen. */
  .is-windows ${SHEET} td .cf-print-text {
    display: block !important;
    visibility: hidden !important;
    height: 0 !important;
    overflow: hidden !important;
  }

  /* Result columns are centered. */
  ${SHEET}:not(.cf-legacy-layout) th.cf-result-col,
  ${SHEET}:not(.cf-legacy-layout) td.cf-result-col { text-align: center !important; }
  ${SHEET}:not(.cf-legacy-layout) td.cf-result-col input${NOT_TB},
  ${SHEET}:not(.cf-legacy-layout) td.cf-result-col select${NOT_TB} {
    text-align: center !important;
    text-align-last: center !important;
  }

  /* Row buttons sit in the page margin, so the columns stay as printed. */
  ${SHEET} .overflow-x-auto:has(.cf-row-action) { overflow: visible !important; }
  ${SHEET} col.cf-row-action,
  ${SHEET} th.cf-row-action { display: none !important; }
  ${SHEET} tr:has(> td.cf-row-action) { position: relative; }
  ${SHEET} td.cf-row-action {
    position: absolute !important;
    left: 100%;
    top: 0;
    border: none !important;
    padding: 2px 0 0 4px !important;
  }

  /* Static cell text uses the cell's size and padding, like the headers. */
  ${SHEET} td .cf-static-text {
    font-size: inherit !important;
    line-height: inherit !important;
    padding: 0 !important;
  }
  ${SHEET} td div[class*="uppercase"] {
    font-size: 8px !important;
    font-weight: 600 !important;
    margin-bottom: 2px !important;
    color: #6b7280 !important;
  }
  ${SHEET} table.job-details-table { font-size: 9px !important; }
  ${SHEET} table.job-details-table th,
  ${SHEET} table.job-details-table td { padding: 4px 6px !important; font-size: 9px !important; }
  ${SHEET} table.job-details-table td div[class*="uppercase"],
  ${SHEET} table.job-details-table td .text-xs { font-size: 7px !important; margin-bottom: 1px !important; }
  ${SHEET} table.job-details-table input,
  ${SHEET} table.job-details-table select,
  ${SHEET} table.job-details-table textarea { font-size: 9px !important; }

  /* Inputs look like the printed text, but stay editable: a faint tint shows
     where you can type, and the focused one is outlined. */
  ${SHEET} input${NOT_TB}:not([type="checkbox"]):not([type="radio"]),
  ${SHEET} select${NOT_TB},
  ${SHEET} textarea${NOT_TB} {
    border: none !important;
    background: rgba(242, 103, 34, 0.05) !important;
    padding: 0 2px !important;
    margin: 0 !important;
    font-size: 10px !important;
    color: #000 !important;
    -webkit-appearance: none !important;
    appearance: none !important;
    background-image: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    /* 1px + min-width: a control never widens its column (on paper it is
       plain text), but still fills the cell once columns are sized. */
    width: 1px !important;
    min-width: 100% !important;
    max-width: 100% !important;
    min-height: 0 !important;
    height: auto !important;
  }
  /* An input beside a unit (°F, %) shares the row with it, so the unit stays
     inside the cell. */
  ${SHEET} .flex > input${NOT_TB}:not([type="checkbox"]):not([type="radio"]) {
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
  }
  ${SHEET} .flex > input.temp-humidity-input${NOT_TB}:not([type="checkbox"]):not([type="radio"]) {
    flex: 0 1 2.5rem !important;
    min-width: 1.5rem !important;
  }
  /* Room for the search icon and clear button on the right. */
  ${SHEET} td .relative > input${NOT_TB}:not([type="checkbox"]):not([type="radio"]) {
    padding-right: 1.25rem !important;
  }
  ${SHEET} input${NOT_TB}:hover,
  ${SHEET} select${NOT_TB}:hover,
  ${SHEET} textarea${NOT_TB}:hover { background: rgba(242, 103, 34, 0.12) !important; }
  ${SHEET} input${NOT_TB}:focus,
  ${SHEET} select${NOT_TB}:focus,
  ${SHEET} textarea${NOT_TB}:focus {
    outline: 1px solid #f26722 !important;
    outline-offset: 0 !important;
    background: #fff !important;
  }
  ${SHEET} input[type="number"]::-webkit-outer-spin-button,
  ${SHEET} input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
  ${SHEET} input[type="number"] { -moz-appearance: textfield !important; }

  /* Section headings and spacing */
  ${SHEET} h2 {
    font-size: 11px !important;
    font-weight: 700 !important;
    margin-bottom: 4px !important;
    color: #000 !important;
  }
  ${SHEET} > div + div { margin-top: 12px; }

  /* The print: utilities the custom-form runtime uses, applied on screen. */
  ${P} .print\\:mt-4 { margin-top: 1rem !important; }
  ${P} .print\\:mb-1 { margin-bottom: 0.25rem !important; }
  ${P} .print\\:gap-2 { gap: 0.5rem !important; }
  ${P} .print\\:gap-0\\.5 { gap: 0.125rem !important; }
  ${P} .print\\:border-t-2 { border-top-width: 2px !important; }
  ${P} .print\\:text-black { color: #000 !important; }
  ${P} .print\\:bg-white { background-color: #fff !important; }
  ${P} .print\\:border-black { border-color: #000 !important; }
  ${P} .print\\:whitespace-normal { white-space: normal !important; }
  /* Print-only blocks show (except the plain-text copy of each input). */
  ${P} .hidden.print\\:block:not(.cf-print-text) { display: block !important; }
  ${P} .hidden.print\\:flex { display: flex !important; }
  ${P} .cf-paper-hide { display: none !important; }
  /* Explicit page breaks show as a dashed line. */
  ${P} .cf-page-break {
    display: block !important;
    border-top: 1px dashed #9ca3af;
    margin: 16px -0.5in !important;
    position: relative;
  }
  ${P} .cf-page-break::after {
    content: "Page break";
    position: absolute;
    right: 0.5in;
    top: -0.6em;
    padding: 0 4px;
    font-size: 9px;
    color: #6b7280;
    background: #fff;
  }

  /* Dark mode stays outside the sheet: paper is always black on white. */
  .dark ${SHEET} [class*="dark:text-"]${NOT_TB} { color: #111827 !important; }
  .dark ${SHEET} [class*="dark:bg-"]${NOT_TB} { background-color: transparent !important; }
  .dark ${SHEET} [class*="dark:border-"]${NOT_TB} { border-color: #d4d4d4 !important; }
  .dark ${SHEET} table [class*="dark:border-"]${NOT_TB} { border-color: #000 !important; }
  .dark ${SHEET} option { color: #000; background: #fff; }
}`;

/** Injects the paper-view stylesheet while mounted. */
export const PaperViewStyles: React.FC = () => <style>{PAPER_CSS}</style>;
