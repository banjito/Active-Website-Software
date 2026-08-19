/**
 * Typefaces for the printed reports.
 *
 * The base-14 PDF fonts (Helvetica and friends) need no registration, which is
 * why they were the starting point — but they are single-byte WinAnsi fonts.
 * Anything outside that encoding comes out as a wrong glyph, and test reports
 * are full of exactly that: "≥ 0.71 MΩ" printed as "Ⓓ.71 M©". Ω, ≥, ≤, Δ and √
 * are not decoration in this domain, they are the units and the criteria.
 *
 * So the reports embed Liberation Sans instead, which covers Greek and the math
 * operators and is metrically compatible with Helvetica/Arial, so nothing in the
 * existing layouts shifts. It ships inside pdfjs-dist (already a dependency for
 * the PDF viewer) under the SIL Open Font License, and is pulled in by URL so
 * the binary stays in node_modules rather than in the repo.
 *
 * Import this module for AMP_FONT rather than reaching for a family name
 * directly: registration is a side effect of the import, and a style that names
 * an unregistered family fails at render time.
 */

import { Font } from "@react-pdf/renderer";
import regularSrc from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import boldSrc from "pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url";

/**
 * Two families rather than one family with two weights: the report styles pick
 * their weight by family name (`fontFamily: AMP_FONT.bodyBold`) and never set
 * fontWeight. Both weights are registered on each family anyway, so a style
 * that does set fontWeight still resolves instead of throwing.
 */
Font.register({
  family: "AMP Sans",
  fonts: [
    { src: regularSrc, fontWeight: 400 },
    { src: boldSrc, fontWeight: 700 },
  ],
});

Font.register({
  family: "AMP Sans Bold",
  fonts: [
    { src: boldSrc, fontWeight: 400 },
    { src: boldSrc, fontWeight: 700 },
  ],
});

export const AMP_FONT = {
  body: "AMP Sans",
  bodyBold: "AMP Sans Bold",
  display: "AMP Sans Bold",
} as const;
