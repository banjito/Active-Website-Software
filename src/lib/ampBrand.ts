/**
 * AMP brand tokens, transcribed from public/amp-brand-sheet.pdf (v1.0).
 *
 * The web UI gets brand orange from the --brand CSS variable so buyer
 * instances can re-skin it. These constants exist for contexts that cannot
 * read CSS variables — chiefly @react-pdf/renderer, which resolves styles in
 * a worker with no DOM.
 */

export const AMP_BRAND = {
  /** Primary. Matches --brand in src/index.css. */
  orange: "#F26722",
  /** Secondary. */
  tan: "#C19D63",
  /** Neutral. Body text and dark panels on print. */
  brown: "#43342F",
  /** Accent. Used here for "normal" condition states. */
  green: "#339C5E",
} as const;

/** Page furniture derived from the brand neutrals. */
export const AMP_PAPER = {
  /** Warm off-white from the brand sheet's page background. */
  background: "#F7F4EF",
  surface: "#FFFFFF",
  border: "#E3DDD4",
  textMuted: "#7A6E68",
} as const;

/**
 * Severity colors for the printed report.
 *
 * Brand green carries "normal"; amber and red are outside the brand palette
 * but are required for an at-a-glance safety signal, so they are kept muted
 * enough to sit beside the brand neutrals.
 */
export const AMP_SEVERITY = {
  good: { fg: "#1F6B41", bg: "#E8F4ED", label: "Normal" },
  caution: { fg: "#8A5A00", bg: "#FDF3E0", label: "Monitor" },
  alert: { fg: "#9B2C1E", bg: "#FBEAE7", label: "Investigate" },
  unknown: { fg: "#7A6E68", bg: "#F0ECE6", label: "Not rated" },
} as const;

/**
 * Typefaces.
 *
 * Helvetica is a standard PDF base-14 font, so @react-pdf/renderer has it
 * without registration. Futura is licensed and not bundled — drop a TTF at
 * public/fonts/Futura.ttf and register it in oilReportPdf.tsx to switch
 * headlines over; until then headlines use Helvetica-Bold.
 */
export const AMP_FONT = {
  body: "Helvetica",
  bodyBold: "Helvetica-Bold",
  display: "Helvetica-Bold",
} as const;
