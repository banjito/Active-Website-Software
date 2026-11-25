/**
 * The SOV pay application as an AMP-branded PDF, for attaching to a bill.
 * Same content as the on-screen printout (src/components/jobs/SovDocument.tsx).
 * Styles can't read CSS variables here, so colors come from src/lib/ampBrand.ts.
 */

import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { AMP_BRAND, AMP_PAPER } from '@/lib/ampBrand';
// Importing AMP_FONT is also what registers the embedded typeface.
import { AMP_FONT } from '@/lib/ampPdfFont';
import { rasterizeLogo } from '@/lib/pdfBranding';
import { companyConfig } from '@/lib/companyConfig';
import { formatChangeOrderNumber } from '@/services/changeOrderService';
import { fetchPmJob, fetchSovCustomer, loadJobBundles, type SovChangeOrder } from '@/services/pmDashboardService';
import {
  isOriginalLine,
  mergedProgress,
  monthLabel,
  payAppAreas,
  payAppLabel,
  payApplication,
  type PayApp,
  type PayAppRow,
} from '@/utils/pmDashboardCalculations';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = (n: number) => money.format(n);
const fmtPct = (p: number | null) => (p == null ? '' : `${Math.round(p * 100)}%`);
const lastDayOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).toLocaleDateString('en-US');
};

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 32, fontFamily: AMP_FONT.body, fontSize: 8, color: AMP_BRAND.brown },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  logo: { height: 30, marginBottom: 4, objectFit: 'contain' },
  muted: { color: AMP_PAPER.textMuted, fontSize: 7.5 },
  title: { fontFamily: AMP_FONT.display, fontSize: 15, textAlign: 'right' },
  rule: { height: 2, width: 90, backgroundColor: AMP_BRAND.orange, alignSelf: 'flex-end', marginVertical: 4 },
  right: { textAlign: 'right' },
  parties: { flexDirection: 'row', gap: 24, marginBottom: 10 },
  party: { flex: 1 },
  label: { fontFamily: AMP_FONT.bodyBold, fontSize: 7, color: AMP_PAPER.textMuted, letterSpacing: 0.6, marginBottom: 2 },
  bold: { fontFamily: AMP_FONT.bodyBold },
  summary: { width: 330, borderWidth: 0.75, borderColor: AMP_PAPER.border, marginBottom: 12 },
  sumRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: AMP_PAPER.border },
  sumLabel: { flex: 1, paddingVertical: 3, paddingHorizontal: 5 },
  sumValue: { width: 90, paddingVertical: 3, paddingHorizontal: 5, textAlign: 'right' },
  table: { borderWidth: 0.75, borderColor: AMP_PAPER.border },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: AMP_PAPER.border },
  headRow: { flexDirection: 'row', backgroundColor: AMP_PAPER.background, borderBottomWidth: 0.75, borderBottomColor: AMP_PAPER.border },
  groupRow: { flexDirection: 'row', backgroundColor: AMP_PAPER.background, borderBottomWidth: 0.75, borderBottomColor: AMP_PAPER.border },
  totalRow: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: AMP_BRAND.brown },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  head: { fontFamily: AMP_FONT.bodyBold, fontSize: 6.5, color: AMP_PAPER.textMuted, letterSpacing: 0.4 },
  num: { textAlign: 'right' },
  signs: { flexDirection: 'row', gap: 40, marginTop: 28 },
  sign: { flex: 1, borderTopWidth: 0.75, borderTopColor: AMP_PAPER.textMuted, paddingTop: 3 },
  footer: { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', color: AMP_PAPER.textMuted, fontSize: 7 },
});

interface SovPdfProps {
  app: PayApp;
  month: string;
  jobNumber: string | null;
  jobTitle: string | null;
  customerName: string;
  customerAddress: string | null;
  retainagePct: number;
  changeOrders: SovChangeOrder[];
  logoPath: string;
}

function SovPdfDocument(p: SovPdfProps) {
  const { app } = p;
  const showRetainage = p.retainagePct > 0;
  // Column widths (percent of the table)
  const W = {
    item: '5%',
    desc: showRetainage ? '31%' : '39%',
    money: '10%',
    pct: '6%',
    ret: '8%',
  };
  const original = app.rows.filter((r) => isOriginalLine(r.line));
  const coGroups = p.changeOrders
    .map((co) => ({ co, rows: app.rows.filter((r) => r.line.change_order_id === co.id) }))
    .filter((g) => g.rows.length > 0);

  let itemNo = 0;
  const lineRow = (r: PayAppRow) => {
    itemNo += 1;
    return (
      <View key={r.line.id} style={s.row} wrap={false}>
        <Text style={[s.cell, { width: W.item, textAlign: 'center' }]}>{itemNo}</Text>
        <Text style={[s.cell, { width: W.desc }]}>{payAppLabel(r.line)}</Text>
        <Text style={[s.cell, s.num, { width: W.money }]}>{fmt(r.scheduled)}</Text>
        <Text style={[s.cell, s.num, { width: W.money }]}>{fmt(r.previous)}</Text>
        <Text style={[s.cell, s.num, { width: W.money }]}>{fmt(r.thisPeriod)}</Text>
        <Text style={[s.cell, s.num, { width: W.money }]}>{fmt(r.completed)}</Text>
        <Text style={[s.cell, s.num, { width: W.pct }]}>{fmtPct(r.pct)}</Text>
        <Text style={[s.cell, s.num, { width: W.money }]}>{fmt(r.balance)}</Text>
        {showRetainage && <Text style={[s.cell, s.num, { width: W.ret }]}>{fmt(r.retainage)}</Text>}
      </View>
    );
  };

  const groupRow = (label: string) => (
    // minPresenceAhead: never leave a heading alone at the bottom of a page
    <View style={s.groupRow} wrap={false} minPresenceAhead={30}>
      <Text style={[s.cell, { width: W.item }]} />
      <Text style={[s.cell, s.bold, { flex: 1 }]}>{label}</Text>
    </View>
  );
  /** Lines with a heading row above each area */
  const areaRows = (rows: PayAppRow[]) =>
    payAppAreas(rows).map((area, i) => (
      <React.Fragment key={i}>
        {area.label && groupRow(area.label)}
        {area.rows.map(lineRow)}
      </React.Fragment>
    ));

  const summary: [string, number, boolean?][] = [
    ['1. Original contract sum', app.originalContract],
    ['2. Net change by Change Orders', app.changeOrders],
    ['3. Contract sum to date (1 + 2)', app.contractToDate],
    ['4. Total completed to date', app.completed],
    [`5. Retainage (${showRetainage ? `${p.retainagePct}%` : 'none'} of completed work)`, app.retainage],
    ['6. Total earned less retainage (4 - 5)', app.earnedLessRetainage],
    ['7. Less previous applications', app.previousCertificates],
    ['8. Current payment due (6 - 7)', app.currentDue, true],
    ['9. Balance to finish, including retainage (3 - 6)', app.balanceWithRetainage],
  ];

  const heads = ['Item', 'Description of work', 'Scheduled value', 'From previous applications', 'This period', 'Total completed to date', '%', 'Balance to finish'];
  const headWidths = [W.item, W.desc, W.money, W.money, W.money, W.money, W.pct, W.money];
  if (showRetainage) {
    heads.push('Retainage');
    headWidths.push(W.ret);
  }

  return (
    <Document title={`Application for Payment ${app.applicationNumber}`} author={companyConfig.fullName}>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image style={s.logo} src={p.logoPath} />
            <Text style={s.muted}>{companyConfig.addressLine}</Text>
            <Text style={s.muted}>{companyConfig.phone}</Text>
          </View>
          <View>
            <Text style={s.title}>Application for Payment</Text>
            <View style={s.rule} />
            <Text style={s.right}>Application {app.applicationNumber}</Text>
            <Text style={s.right}>
              Period: {monthLabel(p.month, 'long')} (to {lastDayOf(p.month)})
            </Text>
            <Text style={[s.muted, s.right]}>Printed {new Date().toLocaleDateString('en-US')}</Text>
          </View>
        </View>

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>TO</Text>
            <Text style={s.bold}>{p.customerName || 'Customer'}</Text>
            {p.customerAddress ? <Text>{p.customerAddress}</Text> : null}
          </View>
          <View style={s.party}>
            <Text style={s.label}>PROJECT</Text>
            <Text style={s.bold}>{p.jobTitle || 'Untitled job'}</Text>
            {p.jobNumber ? <Text>Job {p.jobNumber}</Text> : null}
          </View>
        </View>

        <View style={s.summary} wrap={false}>
          {summary.map(([label, value, strong], i) => (
            <View key={label} style={[s.sumRow, i === summary.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={[s.sumLabel, strong ? s.bold : {}]}>{label}</Text>
              <Text style={[s.sumValue, strong ? s.bold : {}]}>{fmt(value)}</Text>
            </View>
          ))}
        </View>

        <View style={s.table}>
          <View style={s.headRow} fixed>
            {heads.map((h, i) => (
              <Text key={h} style={[s.cell, s.head, { width: headWidths[i] }, i >= 2 ? s.num : {}, i === 0 ? { textAlign: 'center' } : {}]}>
                {h.toUpperCase()}
              </Text>
            ))}
          </View>
          {areaRows(original)}
          {coGroups.map(({ co, rows }) => (
            <React.Fragment key={co.id}>
              {groupRow(
                [`Change Order ${formatChangeOrderNumber(co.number)}`, co.title.trim()].filter(Boolean).join(' · '),
              )}
              {areaRows(rows)}
            </React.Fragment>
          ))}
          <View style={s.totalRow} wrap={false}>
            <Text style={[s.cell, { width: W.item }]} />
            <Text style={[s.cell, s.bold, { width: W.desc }]}>Totals</Text>
            <Text style={[s.cell, s.num, s.bold, { width: W.money }]}>{fmt(app.contractToDate)}</Text>
            <Text style={[s.cell, s.num, s.bold, { width: W.money }]}>{fmt(app.previous)}</Text>
            <Text style={[s.cell, s.num, s.bold, { width: W.money }]}>{fmt(app.thisPeriod)}</Text>
            <Text style={[s.cell, s.num, s.bold, { width: W.money }]}>{fmt(app.completed)}</Text>
            <Text style={[s.cell, s.num, s.bold, { width: W.pct }]}>
              {fmtPct(app.contractToDate ? app.completed / app.contractToDate : null)}
            </Text>
            <Text style={[s.cell, s.num, s.bold, { width: W.money }]}>{fmt(app.contractToDate - app.completed)}</Text>
            {showRetainage && <Text style={[s.cell, s.num, s.bold, { width: W.ret }]}>{fmt(app.retainage)}</Text>}
          </View>
        </View>

        <View style={s.signs} wrap={false}>
          <Text style={[s.sign, s.muted]}>Submitted by ({companyConfig.name})</Text>
          <Text style={[s.sign, s.muted]}>Date</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>
            {companyConfig.fullName}
            {p.jobNumber ? ` · Job ${p.jobNumber}` : ''} · Application {app.applicationNumber}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Build the job's SOV pay application for a month as a PDF file.
 * currentDue lets the caller check it still matches the invoice.
 */
export async function buildSovPdfFile(jobId: string, month: string): Promise<{ file: File; currentDue: number }> {
  const job = await fetchPmJob(jobId);
  if (!job) throw new Error('Job not found.');
  const [result, customer] = await Promise.all([
    loadJobBundles([job]),
    job.customer_id ? fetchSovCustomer(job.customer_id).catch(() => null) : Promise.resolve(null),
  ]);
  const bundle = result.bundles[job.id];
  if (!bundle) throw new Error('This job has no SOV.');
  const retainagePct = customer?.retainagePct ?? 0;
  const app = payApplication(
    bundle.lines,
    mergedProgress(bundle.lines, bundle.reports, bundle.weeks, bundle.gc),
    month,
    retainagePct,
  );
  const logoPath = await rasterizeLogo(companyConfig.reportLogoPath);
  const blob = await pdf(
    <SovPdfDocument
      app={app}
      month={month}
      jobNumber={job.job_number}
      jobTitle={job.title}
      customerName={customer?.name || job.customer_name}
      customerAddress={customer?.address ?? null}
      retainagePct={retainagePct}
      changeOrders={bundle.changeOrders}
      logoPath={logoPath}
    />,
  ).toBlob();
  const name = `SOV - Application ${app.applicationNumber} - ${monthLabel(month, 'long')}.pdf`;
  return { file: new File([blob], name, { type: 'application/pdf' }), currentDue: app.currentDue };
}
