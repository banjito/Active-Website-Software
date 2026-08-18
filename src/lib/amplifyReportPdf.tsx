/**
 * Renders an AmplifyReport as an AMP-branded PDF.
 *
 * Colors and type follow public/amp-brand-sheet.pdf via src/lib/ampBrand.ts.
 * @react-pdf/renderer resolves styles without a DOM, so nothing here can read
 * the --brand CSS variable; buyer instances re-skin by editing ampBrand.ts.
 *
 * Unlike the oil PDF, the section and column set is not known ahead of time —
 * it comes from whatever the workbook held — so column widths are computed per
 * table rather than declared as constants.
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
import { rasterizeLogo, type PdfCompany } from "@/lib/pdfBranding";
import {
  resultSeverity,
  type AmplifyField,
  type AmplifyReport,
  type AmplifySection,
} from "@/lib/amplifyReport";

export type { PdfCompany } from "@/lib/pdfBranding";

/** Stub column when a table has row labels; the rest is shared by the data. */
const STUB_WIDTH = 22;

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

  /* Report summary strip */
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
  specBlock: { flex: 1, borderWidth: 1, borderColor: AMP_PAPER.border },
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

  /* Sections */
  sectionBar: {
    backgroundColor: AMP_BRAND.tan,
    color: AMP_BRAND.brown,
    fontFamily: AMP_FONT.bodyBold,
    fontSize: 7.5,
    paddingVertical: 3,
    paddingHorizontal: 6,
    letterSpacing: 0.4,
    marginTop: 10,
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: AMP_PAPER.border,
  },
  fieldCell: {
    width: "50%",
    flexDirection: "row",
    paddingVertical: 2.5,
    paddingHorizontal: 6,
  },

  /* Tables */
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
  thUnit: { fontFamily: AMP_FONT.body, fontSize: 6.5 },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: AMP_PAPER.border,
  },
  trAlt: { backgroundColor: AMP_PAPER.background },
  td: { paddingVertical: 2.5, paddingHorizontal: 6, fontSize: 7.5 },
  tdLabel: { color: AMP_PAPER.textMuted },

  /* Notes */
  notes: {
    fontSize: 7.5,
    lineHeight: 1.45,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: AMP_PAPER.border,
  },

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

const Badge: React.FC<{ status?: string }> = ({ status }) => {
  const sev = AMP_SEVERITY[resultSeverity(status)];
  return (
    <Text style={[styles.badge, { backgroundColor: sev.bg, color: sev.fg }]}>
      {status ? `${status} · ${sev.label}` : sev.label}
    </Text>
  );
};

const SpecBlock: React.FC<{ title: string; fields: AmplifyField[] }> = ({
  title,
  fields,
}) => (
  <View style={styles.specBlock}>
    <Text style={styles.specHeading}>{title.toUpperCase()}</Text>
    {fields.map((field, i) => (
      <View key={`${field.label}-${i}`} style={styles.specLine}>
        <Text style={styles.specLabel}>{field.label}</Text>
        <Text style={styles.specValue}>{field.value || "—"}</Text>
      </View>
    ))}
  </View>
);

/** One section: title bar, then whichever of the three blocks it carries. */
const SectionBlock: React.FC<{ section: AmplifySection }> = ({ section }) => {
  const table = section.table;
  const hasStub = !!table?.rows.some((row) => row.label);
  const hasResult = !!table?.rows.some((row) => row.result);

  // Whatever the stub and result columns do not take is split evenly.
  const dataColumns = (table?.columns.length ?? 0) + (hasResult ? 1 : 0);
  const dataWidth = `${
    (100 - (hasStub ? STUB_WIDTH : 0)) / Math.max(dataColumns, 1)
  }%`;
  let stripe = 0;

  return (
    <View>
      <Text style={styles.sectionBar}>{section.title.toUpperCase()}</Text>

      {section.fields.length > 0 && (
        <View style={styles.fieldGrid}>
          {section.fields.map((field, i) => (
            <View key={`${field.label}-${i}`} style={styles.fieldCell}>
              <Text style={styles.specLabel}>{field.label}</Text>
              <Text style={styles.specValue}>{field.value || "—"}</Text>
            </View>
          ))}
        </View>
      )}

      {table && (
        <View>
          <View style={styles.tableHeader} wrap={false}>
            {hasStub && (
              <Text style={[styles.th, { width: `${STUB_WIDTH}%` }]}> </Text>
            )}
            {table.columns.map((column, i) => (
              <Text
                key={`${column}-${i}`}
                style={[styles.th, { width: dataWidth }]}
              >
                {column}
                {table.units?.[i] ? (
                  <Text style={styles.thUnit}>{`  ${table.units[i]}`}</Text>
                ) : null}
              </Text>
            ))}
            {hasResult && (
              <Text style={[styles.th, { width: dataWidth }]}>RESULT</Text>
            )}
          </View>

          {table.rows.map((row, r) => (
            <View
              key={r}
              style={[styles.tr, ...(stripe++ % 2 === 1 ? [styles.trAlt] : [])]}
              wrap={false}
            >
              {hasStub && (
                <Text
                  style={[styles.td, styles.tdLabel, { width: `${STUB_WIDTH}%` }]}
                >
                  {row.label || "—"}
                </Text>
              )}
              {table.columns.map((_, c) => (
                <Text key={c} style={[styles.td, { width: dataWidth }]}>
                  {row.cells[c] || "—"}
                </Text>
              ))}
              {hasResult && (
                <Text style={[styles.td, { width: dataWidth }]}>
                  {row.result || "—"}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {section.notes ? <Text style={styles.notes}>{section.notes}</Text> : null}
    </View>
  );
};

const AmplifyReportDocument: React.FC<{
  reports: AmplifyReport[];
  company: PdfCompany;
}> = ({ reports, company }) => (
  <Document
    title={`AMP-lify Report — ${reports.map((r) => r.label).join(", ")}`}
    author={company.fullName}
  >
    {reports.map((report) => {
      const jobFields: AmplifyField[] = [
        { label: "Customer", value: report.customer },
        { label: "Site", value: report.siteName },
        { label: "Address", value: report.siteAddress },
        { label: "Job Number", value: report.jobNumber },
        { label: "Report Date", value: report.reportDate },
        { label: "Technician", value: report.technician },
      ].filter((field) => field.value);

      return (
        <Page key={report.id} size="LETTER" style={styles.page}>
          <View style={styles.header} fixed>
            <View style={styles.headerLeft}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image style={styles.logo} src={company.logoPath} />
              <View>
                <Text style={styles.headerTitle}>AMP-LIFY REPORT</Text>
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
                {report.equipment
                  .slice(0, 4)
                  .map((field) => `${field.label} ${field.value}`)
                  .join("  ·  ")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Badge status={report.status} />
              <Text style={[styles.unitMeta, { marginTop: 4 }]}>
                {report.reportDate || "Undated"}
              </Text>
            </View>
          </View>

          {(report.equipment.length > 0 || jobFields.length > 0) && (
            <View style={styles.specRow}>
              {report.equipment.length > 0 && (
                <SpecBlock title="Equipment" fields={report.equipment} />
              )}
              {report.equipment.length > 0 && jobFields.length > 0 && (
                <View style={{ width: 10 }} />
              )}
              {jobFields.length > 0 && (
                <SpecBlock title="Job Information" fields={jobFields} />
              )}
            </View>
          )}

          {report.sections.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}

          <Text
            style={styles.footer}
            fixed
            render={({ pageNumber, totalPages }) =>
              `${company.fullName}  ·  ${company.addressLine}  ·  ${company.phone}  ·  ${company.websiteDomain}\n` +
              `Source: ${report.sourceFile}${report.sourceSheet ? ` · ${report.sourceSheet}` : ""} · Page ${pageNumber} of ${totalPages}`
            }
          />
        </Page>
      );
    })}
  </Document>
);

/** Build the branded PDF and hand back a Blob for download or preview. */
export async function buildAmplifyReportPdf(
  reports: AmplifyReport[],
  company: PdfCompany,
): Promise<Blob> {
  const logoPath = await rasterizeLogo(company.logoPath);
  return pdf(
    <AmplifyReportDocument
      reports={reports}
      company={{ ...company, logoPath }}
    />,
  ).toBlob();
}

export default AmplifyReportDocument;
