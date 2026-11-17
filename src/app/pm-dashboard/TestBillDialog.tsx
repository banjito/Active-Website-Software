import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { fetchSovCustomer, type PmJob } from '@/services/pmDashboardService';
import {
  billFor,
  createTestSovInvoice,
  deleteTestBill,
  fetchInvoicePdf,
  findTestCompany,
  openInvoicePdf,
  recordBill,
  retainageThisMonth,
  type JobBill,
  type TestCompany,
  type TestInvoice,
} from '@/services/sovBillingService';
import { monthLabel, payApplication, type SovLine, type SovProgress } from '@/utils/pmDashboardCalculations';
import { fmtMoney } from './shared';

// PM item 11 test run: make this month's invoice in the Intuit TEST company and
// pull its PDF back. Never touches the real books.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: PmJob;
  lines: SovLine[];
  progress: SovProgress;
  month: string;
  /** The job's saved bills, so a month isn't billed twice */
  bills: JobBill[];
  /** Reload the bills after one is saved or cleared */
  onBillsChanged: () => void;
}

const ROW = 'flex items-baseline justify-between gap-4 py-1 text-sm';

export function TestBillDialog({ open, onOpenChange, job, lines, progress, month, bills, onBillsChanged }: Props) {
  const [company, setCompany] = useState<TestCompany | null>(null);
  const [retainagePct, setRetainagePct] = useState(0);
  const [loading, setLoading] = useState(false);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<TestInvoice | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setInvoice(null);
    setPdfError(null);
    setRecordError(null);
    void Promise.all([
      findTestCompany(),
      job.customer_id ? fetchSovCustomer(job.customer_id).catch(() => null) : Promise.resolve(null),
    ])
      .then(([found, customer]) => {
        if (!alive) return;
        setCompany(found);
        setRetainagePct(customer?.retainagePct ?? 0);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Could not reach QuickBooks.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, job.customer_id]);

  // Free the PDF when it's replaced or the box closes
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);
  useEffect(() => {
    if (!open) setPdfUrl(null);
  }, [open]);

  const app = useMemo(() => payApplication(lines, progress, month, retainagePct), [lines, progress, month, retainagePct]);
  const billed = app.rows.filter((r) => Math.abs(r.thisPeriod) >= 0.005);
  const held = retainageThisMonth(app);
  const existing = company ? billFor(bills, month, company.realmId) : null;
  const jobLabel = [job.job_number ? `Job ${job.job_number}` : null, job.title].filter(Boolean).join(' ');

  const make = async () => {
    if (!company) return;
    setMaking(true);
    setError(null);
    try {
      const made = await createTestSovInvoice({
        company,
        app,
        retainagePct,
        customerName: job.customer_name,
        jobLabel,
        monthLabel: monthLabel(month, 'long'),
      });
      setInvoice(made);
      try {
        await recordBill({
          job_id: job.id,
          period: month,
          application_number: app.applicationNumber,
          realm_id: company.realmId,
          is_test: true,
          qbo_invoice_id: made.id,
          qbo_doc_number: made.docNumber,
          amount: made.total,
          retainage: retainageThisMonth(app),
        });
        onBillsChanged();
      } catch (err) {
        setRecordError(err instanceof Error ? err.message : 'Could not save the bill record.');
      }
      try {
        setPdfUrl(URL.createObjectURL(await fetchInvoicePdf(company.realmId, made.id)));
      } catch (err) {
        setPdfError(err instanceof Error ? err.message : 'Could not get the PDF.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the invoice.');
    } finally {
      setMaking(false);
    }
  };

  const openExisting = async () => {
    if (!existing) return;
    setError(null);
    try {
      await openInvoicePdf(existing.realm_id, existing.qbo_invoice_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get the PDF.');
    }
  };

  const clearExisting = async () => {
    if (!existing) return;
    setClearing(true);
    setError(null);
    try {
      await deleteTestBill(existing.id);
      onBillsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear the test bill.');
    } finally {
      setClearing(false);
    }
  };

  const mismatch = invoice ? Math.abs(invoice.total - app.currentDue) >= 0.01 : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test bill: {monthLabel(month, 'long')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Goes to the QuickBooks <b>test company</b> only. Nothing is emailed and the real books aren't touched.
          </p>

          {loading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Checking QuickBooks…</p>
          ) : !company ? (
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              No test company is connected. An admin can connect one in Admin → Integrations → Connect test company.
            </p>
          ) : (
            <>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {company.name} · Pay application #{app.applicationNumber}
                </p>
                <div className="divide-y divide-neutral-100 border-y border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                  {billed.length === 0 && (
                    <p className="py-2 text-sm text-neutral-500 dark:text-neutral-400">Nothing billed this month.</p>
                  )}
                  {billed.map((r) => (
                    <div key={r.line.id} className={ROW}>
                      <span className="min-w-0 truncate text-neutral-800 dark:text-neutral-200" title={r.line.item}>
                        {r.line.item}
                      </span>
                      <span className="font-mono text-neutral-900 dark:text-neutral-100">{fmtMoney(r.thisPeriod)}</span>
                    </div>
                  ))}
                  {Math.abs(held) >= 0.005 && (
                    <div className={ROW}>
                      <span className="text-neutral-600 dark:text-neutral-400">Retainage held ({retainagePct}%)</span>
                      <span className="font-mono text-neutral-600 dark:text-neutral-400">{fmtMoney(-held)}</span>
                    </div>
                  )}
                  <div className={`${ROW} font-semibold`}>
                    <span className="text-neutral-900 dark:text-neutral-100">This bill</span>
                    <span className="font-mono text-neutral-900 dark:text-neutral-100">{fmtMoney(app.currentDue)}</span>
                  </div>
                </div>
              </div>

              {existing && !invoice && (
                <div className="space-y-2 border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200">
                  <p>
                    Already billed: invoice {existing.qbo_doc_number ? `#${existing.qbo_doc_number}` : existing.qbo_invoice_id} for{' '}
                    <b>{fmtMoney(existing.amount)}</b> on {new Date(existing.created_at).toLocaleDateString()}.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <button type="button" onClick={openExisting} className="inline-flex items-center gap-1 font-medium underline">
                      Open the invoice PDF
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    {existing.is_test && (
                      <button
                        type="button"
                        onClick={clearExisting}
                        disabled={clearing}
                        className="text-neutral-600 underline hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100"
                        title="Removes ampOS's record so you can test this month again. The test invoice stays in the test company."
                      >
                        {clearing ? 'Clearing…' : 'Clear this test bill'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {invoice && (
                <div className="space-y-2 border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                  <p>
                    Invoice {invoice.docNumber ? `#${invoice.docNumber}` : invoice.id} made for {invoice.customerName}:{' '}
                    <b>{fmtMoney(invoice.total)}</b>.
                  </p>
                  {mismatch && (
                    <p className="text-amber-800 dark:text-amber-300">
                      QuickBooks' total is {fmtMoney(invoice.total - app.currentDue)} off from the pay app.
                    </p>
                  )}
                  {pdfUrl && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium underline"
                    >
                      Open the invoice PDF
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {pdfError && <p className="text-red-700 dark:text-red-400">PDF: {pdfError}</p>}
                  {recordError && (
                    <p className="text-amber-800 dark:text-amber-300">Not saved to the job: {recordError}</p>
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={making}>
              Close
            </Button>
            {company && !invoice && !existing && (
              <Button
                size="sm"
                onClick={make}
                isLoading={making}
                disabled={loading || app.thisPeriod <= 0}
                leftIcon={<FlaskConical className="h-4 w-4" />}
              >
                Make test invoice
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
