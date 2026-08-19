/**
 * Catches characters the report PDF cannot print, before a customer sees them.
 *
 * This exists because of a real failure: with the base-14 Helvetica the reports
 * used to embed, "≥ 0.71 MΩ" printed as "Ⓓ.71 M©" — a single-byte font quietly
 * substituting whatever glyph sat at that byte. Nothing errored, the screen
 * version looked right, and the damage only showed up in the PDF.
 *
 * The embedded font (see ampPdfFont.ts) covers the symbols this domain uses, so
 * a missing glyph is now the exception rather than the rule. But the text comes
 * from hand-maintained workbooks by way of a model, so "the exception" still
 * arrives: an ∠, a stray CJK character, an emoji in a comments cell. Asking the
 * loaded font directly is the only answer that stays true when the typeface
 * changes.
 */

import { Font } from "@react-pdf/renderer";
import { AMP_FONT } from "@/lib/ampPdfFont";
import type { AmplifyReport } from "@/lib/amplifyReport";

/**
 * The one thing needed off a loaded font. fontkit ships no type declarations,
 * so this is narrowed by hand rather than imported, and treated as optional:
 * a future font backend that does not expose it degrades to "no warning"
 * rather than to a crash.
 */
interface LoadedFont {
  hasGlyphForCodePoint?: (codePoint: number) => boolean;
}

/** Both weights are the same typeface, but a subset build could differ. */
const FAMILIES = [AMP_FONT.body, AMP_FONT.bodyBold];

/** Printable ASCII is in every font ever registered here; skip the lookup. */
const isPlainAscii = (codePoint: number): boolean =>
  codePoint >= 0x20 && codePoint <= 0x7e;

async function loadedFonts(): Promise<LoadedFont[]> {
  const fonts: LoadedFont[] = [];

  for (const fontFamily of FAMILIES) {
    try {
      await Font.load({ fontFamily });
      const source = Font.getFont({ fontFamily }) as {
        data?: LoadedFont | null;
      };
      if (source?.data?.hasGlyphForCodePoint) fonts.push(source.data);
    } catch {
      // A font that will not load is the renderer's failure to report, not
      // this guard's: staying quiet here keeps one problem from becoming two.
    }
  }

  return fonts;
}

/**
 * Distinct characters in `text` that the embedded font has no glyph for.
 *
 * Empty when everything prints, or when the font could not be interrogated.
 */
export async function unsupportedPdfCharacters(
  text: string,
): Promise<string[]> {
  const fonts = await loadedFonts();
  if (fonts.length === 0) return [];

  const missing = new Set<string>();
  // Iterating the string (not its code units) keeps astral characters whole.
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || isPlainAscii(codePoint)) continue;
    if (char === "\n" || char === "\r" || char === "\t") continue;
    if (fonts.some((font) => !font.hasGlyphForCodePoint!(codePoint))) {
      missing.add(char);
    }
  }

  return [...missing];
}

/** Every string a report puts on the page, in one blob for scanning. */
export function amplifyReportText(report: AmplifyReport): string {
  const parts: string[] = [
    report.label,
    report.siteName,
    report.siteAddress,
    report.customer,
    report.jobNumber,
    report.reportDate,
    report.technician,
    report.status,
    report.sourceSheet,
  ];

  for (const field of report.equipment) parts.push(field.label, field.value);

  for (const section of report.sections) {
    parts.push(section.title, section.notes);
    for (const field of section.fields) parts.push(field.label, field.value);
    if (!section.table) continue;
    parts.push(...section.table.columns, ...(section.table.units ?? []));
    for (const row of section.table.rows) {
      parts.push(row.label ?? "", row.result ?? "", ...row.cells);
    }
  }

  return parts.join("\n");
}

/** Characters that will not print across a whole set of reports. */
export async function unsupportedAmplifyCharacters(
  reports: AmplifyReport[],
): Promise<string[]> {
  return unsupportedPdfCharacters(reports.map(amplifyReportText).join("\n"));
}
