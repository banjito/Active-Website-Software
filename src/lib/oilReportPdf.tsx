/**
 * Renders an OilReport as an AMP-branded PDF.
 *
 * Colors and type follow public/amp-brand-sheet.pdf via src/lib/ampBrand.ts.
 * @react-pdf/renderer resolves styles without a DOM, so nothing here can read
 * the --brand CSS variable; buyer instances re-skin by editing ampBrand.ts.
 */

import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { AMP_BRAND, AMP_FONT, AMP_PAPER, AMP_SEVERITY } from "@/lib/ampBrand";
import {
  DGA_ROWS,
  FLUID_ROWS,
  IDENT_ROWS,
  conditionSeverity,
  type OilReport,
  type Sample,
} from "@/lib/oilReport";

/** Label column takes a third; sample columns share the rest. */
const LABEL_WIDTH = "34%";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 44,
    paddingHorizontal: 32,
    fontFamily: AMP_FONT.body,
    fontSize: 8,
    color: AMP_BRAND.brown,
    backgroundColor: AMP_PAPER.surface,
  },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: AMP_BRAND.orange,
    paddingBottom: 10,
    marginBottom: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  logo: { height: 26, marginRight: 12 },
  headerTitle: {
    fontFamily: AMP_FONT.display,
    fontSize: 13,
    color: AMP_BRAND.brown,
  },
  headerSubtitle: { fontSize: 7.5, color: AMP_PAPER.textMuted, marginTop: 2 },
  headerRight: { textAlign: "right", maxWidth: 200 },

  /* Unit summary strip */
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: AMP_PAPER.background,
    borderLeftWidth: 3,
    borderLeftColor: AMP_BRAND.orange,
    padding: 10,
    marginBottom: 12,
  },
  unitName: {
    fontFamily: AMP_FONT.display,
    fontSize: 12,
    color: AMP_BRAND.brown,
  },
  unitMeta: { fontSize: 7.5, color: AMP_PAPER.textMuted, marginTop: 3 },

  badge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 0,
    fontSize: 7.5,
    fontFamily: AMP_FONT.bodyBold,
  },

  /* Spec blocks */
  specRow: { flexDirection: "row", marginBottom: 12 },
  specBlock: {
    flex: 1,
    borderWidth: 1,
    borderColor: AMP_PAPER.border,
  },
  specHeading: {
    backgroundColor: AMP_BRAND.brown,
    color: "#FFFFFF",
    fontFamily: AMP_FONT.bodyBold,
    fontSize: 7.5,
    paddingVertical: 4,
    paddingHorizontal: 6,
    letterSpacing: 0.5,
  },
  specLine: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: AMP_PAPER.border,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
  },
  specLabel: { width: "50%", color: AMP_PAPER.textMuted, fontSize: 7.5 },
  specValue: { width: "50%", fontSize: 7.5, fontFamily: AMP_FONT.bodyBold },

  /* Results table */
  tableHeader: {
    flexDirection: "row",
    backgroundColor: AMP_BRAND.orange,
    color: "#FFFFFF",
  },
  th: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontFamily: AMP_FONT.bodyBold,
    fontSize: 8,
  },
  sectionBar: {
    backgroundColor: AMP_BRAND.tan,
    color: AMP_BRAND.brown,
    fontFamily: AMP_FONT.bodyBold,
    fontSize: 7.5,
    paddingVertical: 3,
    paddingHorizontal: 6,
    letterSpacing: 0.4,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: AMP_PAPER.border,
  },
  trAlt: { backgroundColor: AMP_PAPER.background },
  td: { paddingVertical: 2.5, paddingHorizontal: 6, fontSize: 7.5 },
  tdLabel: { color: AMP_PAPER.textMuted },
  tdIndent: { paddingLeft: 14 },

  /* Narratives */
  narrativeHeading: {
    fontFamily: AMP_FONT.display,
    fontSize: 10,
    color: AMP_BRAND.brown,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: AMP_BRAND.tan,
    paddingBottom: 3,
  },
  narrativeBlock: { marginBottom: 10 },
  narrativeDate: {
    fontFamily: AMP_FONT.bodyBold,
    fontSize: 8.5,
    marginBottom: 3,
  },
  narrativeLabel: {
    fontFamily: AMP_FONT.bodyBold,
    fontSize: 7,
    color: AMP_BRAND.orange,
    marginTop: 4,
    letterSpacing: 0.4,
  },
  narrativeText: { fontSize: 7.5, lineHeight: 1.45, marginTop: 1.5 },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    textAlign: "center",
    fontSize: 6.5,
    color: AMP_PAPER.textMuted,
    borderTopWidth: 1,
    borderTopColor: AMP_PAPER.border,
    paddingTop: 6,
  },
});

/** Company values are passed in so this module stays free of import.meta.env. */
export interface PdfCompany {
  fullName: string;
  addressLine: string;
  phone: string;
  websiteDomain: string;
  logoPath: string;
}

const Badge: React.FC<{ condition?: string }> = ({ condition }) => {
  const sev = AMP_SEVERITY[conditionSeverity(condition)];
  return (
    <Text style={[styles.badge, { backgroundColor: sev.bg, color: sev.fg }]}>
      {condition ? `${condition} · ${sev.label}` : sev.label}
    </Text>
  );
};

const SpecBlock: React.FC<{ title: string; rows: [string, string][] }> = ({
  title,
  rows,
}) => (
  <View style={styles.specBlock}>
    <Text style={styles.specHeading}>{title.toUpperCase()}</Text>
    {rows.map(([label, value]) => (
      <View key={label} style={styles.specLine}>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={styles.specValue}>{value || "—"}</Text>
      </View>
    ))}
  </View>
);

/** One data row across all sample columns. */
const Row: React.FC<{
  label: string;
  values: string[];
  colWidth: string;
  indent?: boolean;
  alt?: boolean;
}> = ({ label, values, colWidth, indent, alt }) => (
  <View style={[styles.tr, ...(alt ? [styles.trAlt] : [])]} wrap={false}>
    <Text
      style={[
        styles.td,
        styles.tdLabel,
        { width: LABEL_WIDTH },
        ...(indent ? [styles.tdIndent] : []),
      ]}
    >
      {label}
    </Text>
    {values.map((value, i) => (
      <Text key={i} style={[styles.td, { width: colWidth }]}>
        {value || "—"}
      </Text>
    ))}
  </View>
);

const OilReportDocument: React.FC<{
  reports: OilReport[];
  company: PdfCompany;
}> = ({ reports, company }) => (
  <Document
    title={`Oil Analysis — ${reports.map((r) => r.label).join(", ")}`}
    author={company.fullName}
  >
    {reports.map((report) => {
      const { samples } = report;
      // Sample columns share whatever the label column leaves behind.
      const colWidth = `${66 / Math.max(samples.length, 1)}%`;
      const latest = samples[0];
      let stripe = 0;

      const narratives = samples.filter(
        (s) => s.dgaAnalysis || s.operatingProcedures || s.oilQuality,
      );

      return (
        <Page key={report.id} size="LETTER" style={styles.page}>
          <View style={styles.header} fixed>
            <View style={styles.headerLeft}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image style={styles.logo} src={company.logoPath} />
              <View>
                <Text style={styles.headerTitle}>TRANSFORMER OIL ANALYSIS</Text>
                <Text style={styles.headerSubtitle}>{company.fullName}</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <Text style={{ fontFamily: AMP_FONT.bodyBold, fontSize: 8 }}>
                {report.siteName || "—"}
              </Text>
              <Text style={styles.headerSubtitle}>{report.siteAddress}</Text>
            </View>
          </View>

          <View style={styles.summary}>
            <View>
              <Text style={styles.unitName}>{report.label}</Text>
              <Text style={styles.unitMeta}>
                {[
                  report.nameplate.manufacturer,
                  report.nameplate.equipmentType,
                  report.nameplate.kvaRating && `${report.nameplate.kvaRating} kVA`,
                  report.nameplate.primaryKV && `${report.nameplate.primaryKV} kV`,
                  report.nameplate.serialNumber &&
                    `S/N ${report.nameplate.serialNumber}`,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Badge condition={latest?.dgaCondition} />
              <Text style={[styles.unitMeta, { marginTop: 4 }]}>
                Latest sample {latest?.sampleDate ?? "—"}
              </Text>
            </View>
          </View>

          <View style={styles.specRow}>
            <SpecBlock
              title="Nameplate Data"
              rows={[
                ["Serial Number", report.nameplate.serialNumber],
                ["Unit ID", report.nameplate.unitId],
                ["Equipment Type", report.nameplate.equipmentType],
                ["Manufacturer", report.nameplate.manufacturer],
                ["Year Mfd.", report.nameplate.yearManufactured],
                ["Primary kV", report.nameplate.primaryKV],
                ["Gallons", report.nameplate.gallons],
                ["kVA Rating", report.nameplate.kvaRating],
                ["Phases", report.nameplate.phases],
                ["Fluid Type", report.nameplate.fluidType],
                ["Location", report.nameplate.substationLocation],
                ["Breathing Config.", report.nameplate.breathingConfiguration],
              ]}
            />
            <View style={{ width: 10 }} />
            <SpecBlock
              title="Equipment Information"
              rows={[
                ["Top Valve (in)", report.equipment.topValve],
                ["Bottom Valve (in)", report.equipment.bottomValve],
                ["Hose Length (ft)", report.equipment.hoseLength],
                ["Paint Condition", report.equipment.paintCondition],
                ["Conservator Tank", report.equipment.conservatorTank],
                ["Bushings Enclosed", report.equipment.bushingsEnclosed],
                ["Leaks", report.equipment.leaks],
                ["Radiators", report.equipment.radiators],
                ["Service Energized", report.equipment.serviceEnergized],
                ["Compartments", report.equipment.compartments],
              ]}
            />
          </View>

          {/* Results */}
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: LABEL_WIDTH }]}>SAMPLE DATE</Text>
            {samples.map((s, i) => (
              <Text key={i} style={[styles.th, { width: colWidth }]}>
                {s.sampleDate}
                {i === 0 && samples.length > 1 ? "  (latest)" : ""}
              </Text>
            ))}
          </View>

          <Text style={styles.sectionBar}>SAMPLE IDENTIFICATION</Text>
          {IDENT_ROWS.filter((r) => samples.some((s) => s[r.key])).map((r) => (
            <Row
              key={r.key}
              label={r.label}
              colWidth={colWidth}
              alt={stripe++ % 2 === 1}
              values={samples.map((s) => (s[r.key] as string) ?? "")}
            />
          ))}

          <Text style={styles.sectionBar}>DISSOLVED GAS ANALYSIS (PPM)</Text>
          {DGA_ROWS.filter((r) => samples.some((s) => s.dga[r.key])).map((r) => (
            <Row
              key={r.key}
              label={r.label}
              colWidth={colWidth}
              indent={r.indent}
              alt={stripe++ % 2 === 1}
              values={samples.map((s) => s.dga[r.key] ?? "")}
            />
          ))}
          <Row
            label="DGA Condition"
            colWidth={colWidth}
            alt={stripe++ % 2 === 1}
            values={samples.map((s) => s.dgaCondition ?? "")}
          />
          <Row
            label="Sampling Interval"
            colWidth={colWidth}
            alt={stripe++ % 2 === 1}
            values={samples.map((s) => s.samplingInterval ?? "")}
          />

          <Text style={styles.sectionBar}>FLUID QUALITY</Text>
          {FLUID_ROWS.filter((r) => samples.some((s) => s[r.key])).map((r) => (
            <Row
              key={r.key}
              label={r.unit ? `${r.label}  (${r.unit})` : r.label}
              colWidth={colWidth}
              alt={stripe++ % 2 === 1}
              values={samples.map((s) => (s[r.key] as string) ?? "")}
            />
          ))}

          {narratives.length > 0 && (
            <View break={false}>
              <Text style={styles.narrativeHeading}>
                ANALYSIS &amp; RECOMMENDATIONS
              </Text>
              {narratives.map((s, i) => (
                <View key={i} style={styles.narrativeBlock} wrap={false}>
                  <Text style={styles.narrativeDate}>
                    {s.sampleDate}
                    {s.dgaCondition ? `  —  ${s.dgaCondition}` : ""}
                  </Text>
                  {s.dgaAnalysis && (
                    <>
                      <Text style={styles.narrativeLabel}>DGA ANALYSIS</Text>
                      <Text style={styles.narrativeText}>{s.dgaAnalysis}</Text>
                    </>
                  )}
                  {s.operatingProcedures && (
                    <>
                      <Text style={styles.narrativeLabel}>
                        OPERATING PROCEDURES
                      </Text>
                      <Text style={styles.narrativeText}>
                        {s.operatingProcedures}
                      </Text>
                    </>
                  )}
                  {s.oilQuality && (
                    <>
                      <Text style={styles.narrativeLabel}>OIL QUALITY</Text>
                      <Text style={styles.narrativeText}>{s.oilQuality}</Text>
                    </>
                  )}
                </View>
              ))}
            </View>
          )}

          <Text
            style={styles.footer}
            fixed
            render={({ pageNumber, totalPages }) =>
              `${company.fullName}  ·  ${company.addressLine}  ·  ${company.phone}  ·  ${company.websiteDomain}\n` +
              `Laboratory analysis by MVA Diagnostics · Source: ${report.sourceFile} · Page ${pageNumber} of ${totalPages}`
            }
          />
        </Page>
      );
    })}
  </Document>
);

/**
 * Normalize an SVG so a browser can decode it as an image.
 *
 * Illustrator/Serif exports often declare an enormous intrinsic size and no
 * viewBox — AMP-vector-filled.svg is 1929030px wide, past the ~65535px cap on
 * image dimensions, so it fails to decode untouched. Moving that size into a
 * viewBox and letting the caller set the real dimensions fixes it without
 * editing the source asset.
 */
function normalizeSvg(markup: string, width: number, height: number): string {
  const openTag = markup.match(/<svg\b[^>]*>/i)?.[0];
  if (!openTag) return markup;

  const declaredW = parseFloat(openTag.match(/\bwidth="([\d.]+)/i)?.[1] ?? "");
  const declaredH = parseFloat(openTag.match(/\bheight="([\d.]+)/i)?.[1] ?? "");

  let next = openTag
    .replace(/\swidth="[^"]*"/i, "")
    .replace(/\sheight="[^"]*"/i, "");

  if (!/\bviewBox=/i.test(next) && declaredW > 0 && declaredH > 0) {
    next = next.replace(
      /^<svg/i,
      `<svg viewBox="0 0 ${declaredW} ${declaredH}"`,
    );
  }

  next = next.replace(/^<svg/i, `<svg width="${width}" height="${height}"`);
  return markup.replace(openTag, next);
}

/**
 * Rasterize a vector logo to a PNG data URI.
 *
 * react-pdf's <Image> decodes PNG and JPEG only — an .svg src renders nothing.
 * Non-SVG sources pass straight through.
 */
async function rasterizeLogo(src: string, height = 160): Promise<string> {
  if (!/\.svg(\?|#|$)/i.test(src)) return src;

  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not load logo: ${src} (${res.status})`);
  const markup = await res.text();

  // Aspect ratio comes from the declared size or the viewBox, whichever exists.
  const openTag = markup.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const viewBox = openTag
    .match(/viewBox="([^"]+)"/i)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const w =
    parseFloat(openTag.match(/\bwidth="([\d.]+)/i)?.[1] ?? "") ||
    (viewBox?.[2] ?? 0);
  const h =
    parseFloat(openTag.match(/\bheight="([\d.]+)/i)?.[1] ?? "") ||
    (viewBox?.[3] ?? 0);
  const ratio = w > 0 && h > 0 ? w / h : 1;

  const width = Math.max(1, Math.round(height * ratio));
  const sized = normalizeSvg(markup, width, height);

  // A blob URL keeps the canvas untainted, so toDataURL stays allowed.
  const url = URL.createObjectURL(
    new Blob([sized], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Could not decode logo: ${src}`));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context");
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Build the branded PDF and hand back a Blob for download or preview. */
export async function buildOilReportPdf(
  reports: OilReport[],
  company: PdfCompany,
): Promise<Blob> {
  const logoPath = await rasterizeLogo(company.logoPath);
  return pdf(
    <OilReportDocument reports={reports} company={{ ...company, logoPath }} />,
  ).toBlob();
}

export default OilReportDocument;
