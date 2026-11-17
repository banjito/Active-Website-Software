/**
 * The review "print sheet" look for a report shown in an iframe: the report
 * laid out on a letter-size sheet, zoomed like a PDF viewer. Shared by the
 * review window and the form version compare screen so both show the report
 * exactly as it prints.
 *
 * The zoom sits in a screen-only rule injected into the iframe, so printing is
 * never scaled.
 */

export const REVIEW_ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const STYLE_ID = "review-preview-zoom";

/** The next zoom step up (1) or down (-1) from `current`. */
export function stepReviewZoom(current: number, direction: 1 | -1): number {
  const at = REVIEW_ZOOM_STEPS.findIndex((z) => z >= current - 0.001);
  const index = at === -1 ? REVIEW_ZOOM_STEPS.length - 1 : at;
  const next = Math.min(REVIEW_ZOOM_STEPS.length - 1, Math.max(0, index + direction));
  return REVIEW_ZOOM_STEPS[next];
}

/** Lay the iframe's report out as a print sheet at this zoom. */
export function applyReviewSheet(iframe: HTMLIFrameElement, zoom: number) {
  try {
    const doc = iframe.contentDocument;
    if (!doc?.head) return;
    let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      doc.head.appendChild(style);
    }
    // The report is laid out on a fixed letter-size sheet (8.5in; the
    // preview's 0.25in padding stands in for the print margins), so it
    // wraps exactly as it prints. Zoom scales that sheet; it never reflows,
    // and a sheet wider than the window scrolls sideways.
    doc.documentElement.setAttribute("data-review-sheet", "");
    // Backdrop behind the sheet follows the app theme; the sheet stays white.
    const dark = document.documentElement.classList.contains("dark");
    const backdrop = dark ? "#3f3f3f" : "#e5e7eb";
    const thumb = dark ? "#6b6b6b" : "#9ca3af";
    style.textContent = `@media screen {
      html[data-review-sheet][data-review-sheet] {
        zoom: ${zoom} !important;
        background: ${backdrop} !important;
        /* Some reports' print CSS sets html to 100vw. Under zoom, vw is
           scaled too, so html ends up narrower/wider than the window and
           the centered sheet drifts sideways. Let html size naturally. */
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        /* Reports set html { height: 100% } and body { overflow-x: hidden },
           which hides the sideways scroll bar. The page itself scrolls both
           ways so a zoomed-in sheet wider than the window can be scrolled. */
        height: auto !important;
        overflow: auto !important;
        /* Some reports hide every scroll bar (::-webkit-scrollbar
           { display: none }). Setting scrollbar-color makes Chrome/Edge
           ignore those rules and draw a normal scroll bar again. */
        scrollbar-width: auto !important;
        scrollbar-color: ${thumb} ${backdrop} !important;
      }
      /* Safari still uses the -webkit- rules, so restyle them visibly. */
      html[data-review-sheet]::-webkit-scrollbar {
        display: block !important;
        width: 12px !important;
        height: 12px !important;
        background: ${backdrop} !important;
      }
      html[data-review-sheet]::-webkit-scrollbar-thumb {
        display: block !important;
        background: ${thumb} !important;
        border-radius: 0 !important;
      }
      html[data-review-sheet]::-webkit-scrollbar-corner {
        background: ${backdrop} !important;
      }
      html[data-review-sheet] body {
        /* Anchor absolutely-positioned items (print titles, PASS/FAIL
           boxes) to the sheet, not the window, so zoom can't move them
           off the page. */
        position: relative !important;
        width: 8.5in !important;
        min-width: 8.5in !important;
        max-width: none !important;
        margin: 16px auto !important;
        background: #ffffff !important;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
        overflow: visible !important;
      }
      html[data-review-sheet] #report-container {
        width: auto !important;
        max-width: none !important;
        margin: 0 !important;
        overflow: visible !important;
      }
      /* Custom-form sections set to print landscape start their own 11in
         page. Show them at that width (10.5in inside the 0.25in margins) as
         a sheet of their own, extending past the portrait sheet, so they
         wrap exactly as printed. */
      html[data-review-sheet] .cf-page-landscape {
        box-sizing: content-box !important;
        width: 10.5in !important;
        min-width: 10.5in !important;
        max-width: none !important;
        padding: 0.25in !important;
        margin: 24px 0 24px -0.25in !important;
        background: #ffffff !important;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
        position: relative !important;
      }
      html[data-review-sheet] .cf-page-landscape::before {
        content: "Landscape page";
        position: absolute;
        top: -18px;
        left: 0;
        font-size: 11px;
        color: #6b7280;
      }
    }`;
  } catch {
    /* report not readable yet (still loading) */
  }
}

/** Undo applyReviewSheet (a page in the frame that is not a report). */
export function clearReviewSheet(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentDocument;
    doc?.getElementById(STYLE_ID)?.remove();
    doc?.documentElement.removeAttribute("data-review-sheet");
  } catch {
    /* not readable */
  }
}

/**
 * Inside the report, Ctrl + scroll and Ctrl +/-/0 zoom the report rather than
 * the browser page. Call on each iframe load (a new document drops listeners).
 */
export function attachReviewZoomKeys(
  iframe: HTMLIFrameElement,
  onStep: (direction: 1 | -1) => void,
  onReset: () => void,
) {
  try {
    const win = iframe.contentWindow;
    if (!win) return;
    win.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        onStep(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    win.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "+" || e.key === "=") onStep(1);
      else if (e.key === "-") onStep(-1);
      else if (e.key === "0") onReset();
      else return;
      e.preventDefault();
    });
  } catch {
    /* not same-origin; buttons still work once readable */
  }
}
